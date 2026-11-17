(function () {
    'use strict';

    const section = document.getElementById('contact');
    if (!section) return;

    const byId = (id) => document.getElementById('portfolio-chat-' + id);
    const form = byId('form');
    const input = byId('input');
    const submit = byId('submit');
    const retry = byId('retry');
    const status = byId('status');
    const error = byId('error');
    const messages = byId('messages');
    const MAX_LENGTH = 2000;
    const receipts = [];
    let language = 'en';
    let connection = 'checking';
    let sending = false;
    let composing = false;
    let checking = false;
    let healthVersion = 0;
    let draft = null;
    let errorKey = '';
    let retryAfterAt = null;
    let lastHealthCheck = 0;

    const copy = {
        en: {
            eyebrow: 'A conversation starts here', title: 'Let’s talk about my work',
            description: 'Messages are delivered to Sang-Kyun’s inbox. Automated replies are not available yet.',
            research: 'Research & publications', projects: 'A project question', collaboration: 'Explore a collaboration',
            history: 'Sent during this visit', label: 'Your message', send: 'Send message', sending: 'Sending…',
            shortcut: 'Ctrl / ⌘ + Enter to send', limit: 'Maximum 2,000 characters. Enter adds a new line.',
            note: 'Messages are stored on Sang-Kyun’s Mac mini for up to 30 days.', email: 'Prefer email?',
            placeholder: 'What would you like to know about my research or projects?',
            checking: 'Checking connection', online: 'Inbox online', offline: 'Inbox unavailable', reconnect: 'Check again',
            ideas: 'Message ideas', sentMessages: 'Sent messages',
            empty: 'Please write a message before sending.',
            tooLong: 'Please keep your message within 2,000 characters.',
            unavailable: 'The inbox is temporarily unavailable. Your message is still here. Please try again or use email.',
            timeout: 'Delivery could not be confirmed in time. Your message is still here; retrying will not send a duplicate.',
            network: 'Delivery could not be confirmed. Check your connection and try again. Your message has been kept.',
            rateLimit: 'The inbox has reached its message limit. Please try again later. Your message has been kept.',
            rateLimitUntil: 'The inbox has reached its message limit. Please try again after {time}. Your message has been kept.',
            rejected: 'The message could not be accepted. Please check your message and try again.',
            received: '✓ Message received', receiptBody: 'Saved to Sang-Kyun’s inbox. Automated replies are not available yet.',
            receipt: 'Receipt',
            prompts: {
                research: 'I’d like to know more about your research on ',
                projects: 'I have a question about your project: ',
                collaboration: 'I’d like to explore a collaboration on '
            }
        },
        ko: {
            eyebrow: '대화의 시작', title: '제 연구와 프로젝트에 대해 이야기해요',
            description: '메시지는 고상균의 수신함으로 전달됩니다. 자동 답변 기능은 아직 제공되지 않습니다.',
            research: '연구와 논문', projects: '프로젝트 질문', collaboration: '협업 제안',
            history: '이번 방문에서 보낸 메시지', label: '메시지', send: '메시지 보내기', sending: '보내는 중…',
            shortcut: 'Ctrl / ⌘ + Enter로 전송', limit: '최대 2,000자까지 입력할 수 있습니다. Enter는 줄바꿈입니다.',
            note: '메시지는 고상균의 Mac mini에 최대 30일 동안 저장됩니다.', email: '이메일로 연락하기',
            placeholder: '연구나 프로젝트에 대해 궁금한 점을 남겨 주세요.',
            checking: '연결 확인 중', online: '메시지 수신 가능', offline: '현재 연결되지 않음', reconnect: '다시 확인',
            ideas: '메시지 주제', sentMessages: '보낸 메시지',
            empty: '보낼 메시지를 먼저 입력해 주세요.',
            tooLong: '메시지는 2,000자 이내로 입력해 주세요.',
            unavailable: '현재 수신함에 연결할 수 없습니다. 입력한 내용은 유지됩니다. 잠시 후 다시 시도하거나 이메일로 연락해 주세요.',
            timeout: '시간 내에 수신을 확인하지 못했습니다. 입력한 내용은 유지됩니다. 다시 보내도 중복 저장되지 않습니다.',
            network: '메시지 수신을 확인하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요. 입력한 내용은 유지됩니다.',
            rateLimit: '수신함의 메시지 수신 한도에 도달했습니다. 나중에 다시 시도해 주세요. 입력한 내용은 유지됩니다.',
            rateLimitUntil: '수신함의 메시지 수신 한도에 도달했습니다. {time} 이후 다시 시도해 주세요. 입력한 내용은 유지됩니다.',
            rejected: '메시지를 접수하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요.',
            received: '✓ 메시지 수신 완료', receiptBody: '고상균의 수신함에 저장되었습니다. 자동 답변은 아직 제공되지 않습니다.',
            receipt: '접수 번호',
            prompts: {
                research: '다음 연구에 대해 더 알고 싶습니다: ',
                projects: '프로젝트에 대해 질문이 있습니다: ',
                collaboration: '다음 주제로 협업을 제안하고 싶습니다: '
            }
        }
    };

    let endpoint = '';
    try {
        const configured = window.PORTFOLIO_CHAT_CONFIG && window.PORTFOLIO_CHAT_CONFIG.endpoint;
        const url = new URL(configured);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
            throw new Error('Invalid inbox endpoint');
        }
        endpoint = url.href.replace(/\/$/, '');
    } catch (_) {
        connection = 'offline';
    }

    function showError(key) {
        errorKey = key;
        error.textContent = key ? copy[language][key] : '';
        if (key === 'rateLimit' && retryAfterAt && retryAfterAt > Date.now()) {
            const time = new Intl.DateTimeFormat(language === 'ko' ? 'ko-KR' : 'en-US', {
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit'
            }).format(retryAfterAt);
            error.textContent = copy[language].rateLimitUntil.replace('{time}', time);
        }
        error.hidden = !key;
        input.setAttribute('aria-invalid', String(key === 'empty' || key === 'tooLong' || key === 'rejected'));
    }

    function parseRetryAfter(value) {
        if (!value) return null;
        const trimmed = value.trim();
        const time = /^\d+$/.test(trimmed) ? Date.now() + Number(trimmed) * 1000 : Date.parse(trimmed);
        return Number.isFinite(time) && Number.isFinite(new Date(time).getTime()) && time > Date.now() ? time : null;
    }

    function updateCount() {
        const counter = byId('counter');
        counter.textContent = input.value.length.toLocaleString('en-US') + ' / 2,000';
        counter.dataset.full = String(input.value.length >= MAX_LENGTH);
    }

    function updateControls() {
        input.disabled = sending;
        submit.disabled = sending || !endpoint;
        form.setAttribute('aria-busy', String(sending));
        byId('submit-text').textContent = copy[language][sending ? 'sending' : 'send'];
        section.querySelectorAll('[data-chat-prompt]').forEach((button) => { button.disabled = sending; });
        retry.disabled = checking || sending;
        retry.hidden = connection !== 'offline' || !endpoint;
        status.dataset.state = connection;
        byId('status-text').textContent = copy[language][connection];
    }

    function localizeReceipt(item) {
        item.title.textContent = copy[language].received;
        item.body.textContent = copy[language].receiptBody;
        const time = new Intl.DateTimeFormat(language === 'ko' ? 'ko-KR' : 'en-US', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        }).format(item.date);
        item.meta.textContent = time + ' · ' + copy[language].receipt + ' ' + item.id.slice(0, 8);
    }

    function localize() {
        language = document.body.classList.contains('lang-kr-mode') ? 'ko' : 'en';
        section.setAttribute('lang', language);
        section.querySelectorAll('[data-chat-copy]').forEach((node) => {
            const text = copy[language][node.dataset.chatCopy];
            if (node.hasAttribute('data-chat-prompt')) {
                node.textContent = text + ' ';
                const arrow = document.createElement('span');
                arrow.setAttribute('aria-hidden', 'true');
                arrow.textContent = '↗';
                node.append(arrow);
            } else {
                node.textContent = text;
            }
        });
        input.placeholder = copy[language].placeholder;
        byId('prompts').setAttribute('aria-label', copy[language].ideas);
        messages.setAttribute('aria-label', copy[language].sentMessages);
        receipts.forEach(localizeReceipt);
        showError(errorKey);
        updateControls();
    }

    async function request(path, options) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(endpoint + path, Object.assign({
                mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal
            }, options));
            let body = null;
            try { body = await response.json(); } catch (failure) {
                if (failure.name === 'AbortError') throw failure;
                // An invalid receipt is never treated as delivery.
            }
            return { response, body };
        } finally {
            window.clearTimeout(timeout);
        }
    }

    async function checkHealth() {
        if (!endpoint || checking || sending) return;
        checking = true;
        const version = ++healthVersion;
        lastHealthCheck = Date.now();
        connection = 'checking';
        updateControls();
        try {
            const { response, body } = await request('/health', { method: 'GET' });
            if (version === healthVersion) {
                connection = response.ok && body && body.status === 'ok' && body.mode === 'inbox' ? 'online' : 'offline';
            }
        } catch (_) {
            if (version === healthVersion) connection = 'offline';
        } finally {
            checking = false;
            updateControls();
        }
    }

    function appendReceipt(message, receipt) {
        const exchange = document.createElement('div');
        exchange.className = 'portfolio-chat-exchange';
        const bubble = document.createElement('p');
        bubble.className = 'portfolio-chat-message';
        bubble.textContent = message;
        const confirmation = document.createElement('p');
        confirmation.className = 'portfolio-chat-receipt';
        const title = document.createElement('span');
        title.className = 'portfolio-chat-receipt-title';
        const body = document.createElement('span');
        const meta = document.createElement('span');
        meta.className = 'portfolio-chat-receipt-meta';
        const item = { title, body, meta, id: receipt.receiptId, date: new Date(receipt.receivedAt) };
        localizeReceipt(item);
        receipts.push(item);
        confirmation.append(title, body, meta);
        exchange.append(bubble, confirmation);
        byId('history').hidden = false;
        messages.append(exchange);
        messages.scrollTop = messages.scrollHeight;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (sending || !endpoint) return;
        const message = input.value.trim();
        if (!message) {
            showError('empty');
            input.focus();
            return;
        }
        if (input.value.length > MAX_LENGTH) {
            showError('tooLong');
            input.focus();
            return;
        }
        if (!draft || draft.message !== message) {
            draft = { message, language, clientMessageId: crypto.randomUUID() };
        }
        const submission = draft;
        healthVersion += 1;
        sending = true;
        showError('');
        updateControls();
        try {
            const { response, body } = await request('/v1/messages', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submission)
            });
            if (!response.ok) {
                if (response.status === 429) retryAfterAt = parseRetryAfter(response.headers.get('Retry-After'));
                const validationErrors = { 429: 'rateLimit', 413: 'tooLong', 400: 'rejected' };
                if (validationErrors[response.status]) {
                    connection = 'online';
                    showError(validationErrors[response.status]);
                } else {
                    connection = 'offline';
                    showError('unavailable');
                }
                return;
            }
            if ((response.status !== 200 && response.status !== 201) || !body || body.status !== 'received' ||
                body.mode !== 'inbox' || typeof body.receiptId !== 'string' ||
                !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.receiptId) ||
                typeof body.receivedAt !== 'string' || !Number.isFinite(Date.parse(body.receivedAt))) {
                connection = 'offline';
                showError('network');
                return;
            }
            appendReceipt(message, body);
            input.value = '';
            draft = null;
            connection = 'online';
            updateCount();
        } catch (failure) {
            connection = 'offline';
            showError(failure.name === 'AbortError' ? 'timeout' : 'network');
        } finally {
            sending = false;
            updateControls();
            input.focus({ preventScroll: true });
        }
    });

    input.addEventListener('input', () => {
        updateCount();
        if (errorKey) showError('');
    });
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; });
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing && !composing && event.keyCode !== 229) {
            event.preventDefault();
            form.requestSubmit();
        }
    });
    section.querySelectorAll('[data-chat-prompt]').forEach((button) => {
        button.addEventListener('click', () => {
            if (sending) return;
            // A topic never overwrites a visitor's draft or submits a message.
            if (!input.value.trim()) input.value = copy[language].prompts[button.dataset.chatPrompt];
            updateCount();
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        });
    });
    retry.addEventListener('click', checkHealth);
    window.addEventListener('online', checkHealth);
    window.addEventListener('offline', () => { healthVersion += 1; connection = 'offline'; updateControls(); });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && Date.now() - lastHealthCheck > 60000) checkHealth();
    });
    new MutationObserver(localize).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    localize();
    updateCount();
    checkHealth();
})();
