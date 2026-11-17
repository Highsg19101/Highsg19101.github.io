(function () {
    'use strict';
    const form = document.getElementById('portfolio-chat-form');
    if (!form) return;
    const input = document.getElementById('portfolio-chat-input');
    const example = document.getElementById('portfolio-chat-example');
    const submit = document.getElementById('portfolio-chat-submit');
    const feedback = document.getElementById('portfolio-chat-feedback');
    const exchange = document.getElementById('portfolio-chat-exchange');
    const question = document.getElementById('portfolio-chat-question');
    const reply = document.getElementById('portfolio-chat-reply');
    const replyStatus = document.getElementById('portfolio-chat-reply-status');
    const statusLabel = document.getElementById('portfolio-chat-status-label') || replyStatus;
    const retry = document.getElementById('portfolio-chat-retry');
    const storageKey = 'portfolio-chat-reply-v1';
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
    const pollWindow = 10 * 60 * 1000;
    let language = 'en';
    let sending = false;
    let composing = false;
    let draft = null;
    let active = null;
    let feedbackKey = '';
    let replyKey = '';
    let retryAt = null;
    let endpoint = '';
    let pollTimer = null;
    let pollController = null;
    let pollGeneration = 0;
    let pollStarted = 0;
    let pollErrors = 0;
    const copy = {
        en: {
            label: 'Message', send: 'Send message', sending: 'Sending message',
            example: 'What did your master’s thesis contribute to the field?',
            examplePrefix: 'Try: ', useExample: 'Use example question',
            empty: 'Please enter a message.', tooLong: 'Please keep your message within 2,000 characters.',
            received: 'Message sent.', rejected: 'Please check your message and try again.',
            unavailable: 'Unable to confirm delivery. Your message is still here; please try again.',
            timeout: 'Delivery could not be confirmed in time. Please try again; retries will not send a duplicate.',
            rateLimit: 'Please try again later. Your message has been kept.',
            rateLimitUntil: 'Please try again after {time}. Your message has been kept.',
            yourQuestion: 'Your question', answer: 'Answer', pending: 'Waiting for an answer…',
            running: 'Preparing an answer…', reconnecting: 'Reconnecting to check your answer…',
            paused: 'The answer is taking longer than expected. You can check again without sending your question again.',
            disconnected: 'Unable to check your answer right now. Please check again shortly.',
            failed: 'An answer could not be generated. Please try asking again.',
            expired: 'This answer is no longer available. Please send your question again.',
            checkAgain: 'Check for an answer'
        },
        ko: {
            label: '메시지', send: '메시지 보내기', sending: '메시지 보내는 중',
            example: '이 사람의 석사 졸업 논문에 있는 연구들은 어떤 학술적 기여가 있어?',
            examplePrefix: '예시) ', useExample: '예시 질문 입력',
            empty: '메시지를 입력해 주세요.', tooLong: '2,000자 이내로 입력해 주세요.',
            received: '메시지를 보냈습니다.', rejected: '입력 내용을 확인하고 다시 시도해 주세요.',
            unavailable: '전송을 확인하지 못했습니다. 입력한 내용은 유지됩니다. 다시 시도해 주세요.',
            timeout: '시간 내에 전송을 확인하지 못했습니다. 다시 보내도 중복 저장되지 않습니다.',
            rateLimit: '잠시 후 다시 시도해 주세요. 입력한 내용은 유지됩니다.',
            rateLimitUntil: '{time} 이후 다시 시도해 주세요. 입력한 내용은 유지됩니다.',
            yourQuestion: '질문', answer: '답변', pending: '답변을 기다리고 있습니다…',
            running: '답변을 작성하고 있습니다…', reconnecting: '답변을 확인하기 위해 다시 연결하고 있습니다…',
            paused: '답변이 예상보다 오래 걸리고 있습니다. 질문을 다시 보내지 않고 답변을 조회할 수 있습니다.',
            disconnected: '지금은 답변을 확인할 수 없습니다. 잠시 후 다시 조회해 주세요.',
            failed: '답변을 생성하지 못했습니다. 질문을 다시 보내 주세요.',
            expired: '이 답변은 더 이상 조회할 수 없습니다. 질문을 다시 보내 주세요.',
            checkAgain: '답변 다시 조회'
        }
    };
    try {
        const url = new URL(window.PORTFOLIO_CHAT_CONFIG.endpoint);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
        endpoint = url.href.replace(/\/$/, '');
    } catch (_) { /* Keep the draft available if configuration is missing. */ }

    function persist() {
        try {
            // Only this tab retains the capability. It is never placed in a URL or analytics event.
            if (draft || active) sessionStorage.setItem(storageKey, JSON.stringify({ draft, active }));
            else sessionStorage.removeItem(storageKey);
        } catch (_) { /* Private browsing or full storage must not prevent sending. */ }
    }

    function showFeedback(key) {
        feedbackKey = key;
        feedback.textContent = key ? copy[language][key] : '';
        if (key === 'rateLimit' && retryAt && retryAt > Date.now()) {
            const time = new Intl.DateTimeFormat(language === 'ko' ? 'ko-KR' : 'en-US', {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit'
            }).format(retryAt);
            feedback.textContent = copy[language].rateLimitUntil.replace('{time}', time);
        }
        feedback.hidden = !key;
        feedback.dataset.kind = key === 'received' ? 'success' : 'error';
        input.setAttribute('aria-invalid', String(['empty', 'tooLong', 'rejected'].includes(key)));
    }

    function showReplyStatus(key) {
        replyKey = key;
        const label = key ? copy[language][key] : '';
        if (statusLabel.textContent !== label) statusLabel.textContent = label;
        replyStatus.toggleAttribute('data-thinking', key === 'pending' || key === 'running');
        replyStatus.hidden = !key;
        retry.hidden = !['paused', 'disconnected'].includes(key);
        reply.setAttribute('aria-busy', String(['pending', 'running', 'reconnecting'].includes(key)));
    }

    function localize() {
        language = document.body.classList.contains('lang-kr-mode') ? 'ko' : 'en';
        if (example && example.lang !== language) {
            const { example: message, examplePrefix, useExample } = copy[language];
            const preview = example.firstElementChild;
            example.lang = language;
            example.setAttribute('aria-label', useExample + ': ' + message);
            preview.replaceChildren(examplePrefix);
            Array.from(message).forEach((character, index) => {
                const letter = document.createElement('span');
                letter.className = 'example-letter';
                letter.style.setProperty('--letter-delay', index * 32 + 'ms');
                letter.textContent = character;
                preview.append(letter);
            });
            example.hidden = false;
        }
        input.setAttribute('aria-label', copy[language].label);
        submit.setAttribute('aria-label', copy[language][sending ? 'sending' : 'send']);
        question.setAttribute('aria-label', copy[language].yourQuestion);
        reply.setAttribute('aria-label', copy[language].answer);
        retry.textContent = copy[language].checkAgain;
        showFeedback(feedbackKey);
        showReplyStatus(replyKey);
    }

    function updateControls() {
        input.disabled = sending;
        submit.disabled = sending;
        if (example) example.disabled = sending || input.value !== '';
        form.setAttribute('aria-busy', String(sending));
        submit.setAttribute('aria-label', copy[language][sending ? 'sending' : 'send']);
    }

    function createToken() {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function retryDelay(response) {
        const value = (response.headers.get('Retry-After') || '').trim();
        const time = /^\d+$/.test(value) ? Date.now() + Number(value) * 1000 : Date.parse(value);
        return Number.isFinite(new Date(time).getTime()) ? Math.max(0, time - Date.now()) : 0;
    }

    function stopPolling() {
        pollGeneration += 1;
        window.clearTimeout(pollTimer);
        pollTimer = null;
        if (pollController) pollController.abort();
        pollController = null;
    }

    function renderAnswer(text) {
        // Model output remains plain text, including any HTML or Markdown it contains.
        reply.replaceChildren();
        const urlPattern = /https?:\/\/[^\s<>"'\u0000-\u001f]+/g;
        let cursor = 0;
        for (const match of text.matchAll(urlPattern)) {
            const raw = match[0].replace(/[.,;:!?\]\)\}]+$/, '');
            reply.append(document.createTextNode(text.slice(cursor, match.index)));
            let url;
            try { url = new URL(raw); } catch (_) { /* Render invalid URLs as text. */ }
            if (url && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
                const link = document.createElement('a');
                link.href = url.href;
                link.textContent = raw;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                reply.append(link);
            } else reply.append(document.createTextNode(raw));
            cursor = match.index + raw.length;
        }
        reply.append(document.createTextNode(text.slice(cursor)));
        reply.hidden = false;
    }

    function schedulePoll(generation, delay) {
        if (generation !== pollGeneration || !active) return;
        const remaining = pollWindow - (Date.now() - pollStarted);
        if (remaining <= 0 || delay >= remaining) {
            pollTimer = window.setTimeout(() => {
                if (generation === pollGeneration) showReplyStatus('paused');
            }, Math.max(0, remaining));
            return;
        }
        pollTimer = window.setTimeout(() => poll(generation), delay);
    }

    async function poll(generation) {
        if (generation !== pollGeneration || !active || pollController) return;
        if (Date.now() - pollStarted >= pollWindow) { showReplyStatus('paused'); return; }
        const current = active;
        const controller = new AbortController();
        pollController = controller;
        const timeout = window.setTimeout(() => controller.abort(), Math.min(15000, pollWindow - (Date.now() - pollStarted)));
        let nextDelay = Date.now() - pollStarted < 60000 ? 3000 : 5000;
        let again = false;
        try {
            const response = await fetch(endpoint + '/v1/messages/' + current.receiptId + '/reply', {
                method: 'GET', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error',
                headers: { Authorization: 'Bearer ' + current.replyToken }, signal: controller.signal
            });
            if (generation !== pollGeneration) return;
            if (response.status === 404) {
                active = null;
                persist();
                showReplyStatus('expired');
                return;
            }
            if (response.status === 429) {
                nextDelay = Math.max(3000, retryDelay(response));
                showReplyStatus('reconnecting');
                again = true;
                return;
            }
            if (!response.ok || response.status !== 200) throw new Error('Reply unavailable');
            const result = await response.json();
            if (generation !== pollGeneration) return;
            if (!result || result.receiptId !== current.receiptId ||
                !['pending', 'running', 'succeeded', 'failed'].includes(result.status)) throw new Error('Invalid reply');
            if (result.status === 'succeeded') {
                if (typeof result.answer !== 'string' || !result.answer.trim() || result.answer.length > 16000) throw new Error('Invalid answer');
                renderAnswer(result.answer);
                showReplyStatus('');
                active = null;
                persist();
                return;
            }
            if (result.status === 'failed') {
                active = null;
                persist();
                showReplyStatus('failed');
                return;
            }
            pollErrors = 0;
            showReplyStatus(result.status);
            again = true;
        } catch (_) {
            if (generation !== pollGeneration) return;
            pollErrors += 1;
            if (pollErrors >= 5) showReplyStatus('disconnected');
            else {
                nextDelay = Math.min(30000, 3000 * Math.pow(2, pollErrors - 1));
                showReplyStatus('reconnecting');
                again = true;
            }
        } finally {
            window.clearTimeout(timeout);
            if (generation === pollGeneration) {
                pollController = null;
                if (again) schedulePoll(generation, nextDelay);
            }
        }
    }

    function beginPolling(immediate) {
        if (!active || !endpoint) return;
        stopPolling();
        pollStarted = Date.now();
        pollErrors = 0;
        question.textContent = active.message;
        reply.replaceChildren();
        reply.hidden = true;
        exchange.hidden = false;
        showReplyStatus('pending');
        schedulePoll(pollGeneration, immediate ? 0 : 3000);
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (sending) return;
        const message = input.value.trim();
        if (!message || input.value.length > 2000) {
            showFeedback(message ? 'tooLong' : 'empty');
            input.focus();
            return;
        }
        if (!endpoint) { showFeedback('unavailable'); return; }
        try {
            if (!draft || draft.message !== message) {
                draft = { message, language, clientMessageId: crypto.randomUUID(), replyToken: createToken() };
                persist();
            }
        } catch (_) { showFeedback('unavailable'); return; }
        sending = true;
        showFeedback('');
        updateControls();
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(endpoint + '/v1/messages', {
                method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft), signal: controller.signal
            });
            if (!response.ok) {
                if (response.status === 429) retryAt = Date.now() + retryDelay(response);
                showFeedback(({ 400: 'rejected', 413: 'tooLong', 429: 'rateLimit' })[response.status] || 'unavailable');
                return;
            }
            const receipt = await response.json();
            if (![200, 201].includes(response.status) || !receipt || receipt.status !== 'received' || receipt.mode !== 'inbox' ||
                !uuidPattern.test(receipt.receiptId) || typeof receipt.receivedAt !== 'string' ||
                !Number.isFinite(Date.parse(receipt.receivedAt)) || receipt.replyEnabled !== true) throw new Error('Invalid receipt');
            stopPolling();
            active = { receiptId: receipt.receiptId, receivedAt: receipt.receivedAt, replyToken: draft.replyToken, message: draft.message };
            input.value = '';
            draft = null;
            persist();
            showFeedback('');
            beginPolling(false);
        } catch (failure) {
            showFeedback(failure.name === 'AbortError' ? 'timeout' : 'unavailable');
        } finally {
            window.clearTimeout(timeout);
            sending = false;
            updateControls();
            input.focus({ preventScroll: true });
        }
    });
    retry.addEventListener('click', () => beginPolling(true));
    function useExample() {
        if (sending || input.value || composing) return;
        input.value = copy[language].example;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus({ preventScroll: true });
        input.setSelectionRange(input.value.length, input.value.length);
    }
    if (example) {
        example.addEventListener('click', useExample);
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries, self) => {
                if (entries.some(entry => entry.isIntersecting)) {
                    example.classList.add('in-view');
                    self.disconnect();
                }
            });
            observer.observe(form);
        }
    }
    input.addEventListener('input', () => {
        if (example) example.disabled = sending || input.value !== '';
        showFeedback('');
    });
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; });
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Tab' && example && !example.disabled && !input.value && !event.shiftKey &&
            !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing && !composing && event.keyCode !== 229) {
            event.preventDefault();
            useExample();
            return;
        }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing && !composing && event.keyCode !== 229) {
            event.preventDefault();
            form.requestSubmit();
        }
    });
    try {
        const saved = JSON.parse(sessionStorage.getItem(storageKey));
        if (saved && saved.draft && typeof saved.draft.message === 'string' && saved.draft.message.trim() &&
            saved.draft.message.length <= 2000 && ['en', 'ko'].includes(saved.draft.language) &&
            uuidPattern.test(saved.draft.clientMessageId) && tokenPattern.test(saved.draft.replyToken)) {
            const item = saved.draft;
            draft = { message: item.message, language: item.language, clientMessageId: item.clientMessageId, replyToken: item.replyToken };
            input.value = draft.message;
        }
        if (saved && saved.active && uuidPattern.test(saved.active.receiptId) && tokenPattern.test(saved.active.replyToken) &&
            typeof saved.active.message === 'string' && saved.active.message.length <= 2000 &&
            typeof saved.active.receivedAt === 'string' && Number.isFinite(Date.parse(saved.active.receivedAt)) &&
            Date.now() - Date.parse(saved.active.receivedAt) < 30 * 24 * 60 * 60 * 1000) {
            const item = saved.active;
            active = { receiptId: item.receiptId, receivedAt: item.receivedAt, replyToken: item.replyToken, message: item.message };
        }
    } catch (_) { /* Ignore unavailable or invalid tab storage. */ }
    new MutationObserver(localize).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    localize();
    updateControls();
    if (active) beginPolling(true);
})();
