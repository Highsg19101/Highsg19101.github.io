(function () {
    'use strict';
    const form = document.getElementById('portfolio-chat-form');
    if (!form) return;
    const input = document.getElementById('portfolio-chat-input');
    const submit = document.getElementById('portfolio-chat-submit');
    const feedback = document.getElementById('portfolio-chat-feedback');
    let language = 'en';
    let sending = false;
    let composing = false;
    let draft = null;
    let feedbackKey = '';
    let retryAt = null;
    let endpoint = '';
    const copy = {
        en: {
            label: 'Message', send: 'Send message', sending: 'Sending message',
            empty: 'Please enter a message.', tooLong: 'Please keep your message within 2,000 characters.',
            received: 'Message sent.', rejected: 'Please check your message and try again.',
            unavailable: 'Unable to confirm delivery. Your message is still here; please try again.',
            timeout: 'Delivery could not be confirmed in time. Please try again; retries will not send a duplicate.',
            rateLimit: 'Please try again later. Your message has been kept.',
            rateLimitUntil: 'Please try again after {time}. Your message has been kept.'
        },
        ko: {
            label: '메시지', send: '메시지 보내기', sending: '메시지 보내는 중',
            empty: '메시지를 입력해 주세요.', tooLong: '2,000자 이내로 입력해 주세요.',
            received: '메시지를 보냈습니다.', rejected: '입력 내용을 확인하고 다시 시도해 주세요.',
            unavailable: '전송을 확인하지 못했습니다. 입력한 내용은 유지됩니다. 다시 시도해 주세요.',
            timeout: '시간 내에 전송을 확인하지 못했습니다. 다시 보내도 중복 저장되지 않습니다.',
            rateLimit: '잠시 후 다시 시도해 주세요. 입력한 내용은 유지됩니다.',
            rateLimitUntil: '{time} 이후 다시 시도해 주세요. 입력한 내용은 유지됩니다.'
        }
    };
    try {
        const url = new URL(window.PORTFOLIO_CHAT_CONFIG.endpoint);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
        endpoint = url.href.replace(/\/$/, '');
    } catch (_) { /* Keep the draft available if configuration is missing. */ }

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

    function localize() {
        language = document.body.classList.contains('lang-kr-mode') ? 'ko' : 'en';
        input.setAttribute('aria-label', copy[language].label);
        submit.setAttribute('aria-label', copy[language][sending ? 'sending' : 'send']);
        showFeedback(feedbackKey);
    }

    function updateControls() {
        input.disabled = sending;
        submit.disabled = sending;
        form.setAttribute('aria-busy', String(sending));
        submit.setAttribute('aria-label', copy[language][sending ? 'sending' : 'send']);
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
        if (!draft || draft.message !== message) draft = { message, language, clientMessageId: crypto.randomUUID() };
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
                if (response.status === 429) {
                    const value = (response.headers.get('Retry-After') || '').trim();
                    const time = /^\d+$/.test(value) ? Date.now() + Number(value) * 1000 : Date.parse(value);
                    retryAt = Number.isFinite(new Date(time).getTime()) ? time : null;
                }
                showFeedback(({ 400: 'rejected', 413: 'tooLong', 429: 'rateLimit' })[response.status] || 'unavailable');
                return;
            }
            const receipt = await response.json();
            if (![200, 201].includes(response.status) || !receipt || receipt.status !== 'received' || receipt.mode !== 'inbox' ||
                typeof receipt.receiptId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receipt.receiptId) ||
                typeof receipt.receivedAt !== 'string' || !Number.isFinite(Date.parse(receipt.receivedAt))) throw new Error('Invalid receipt');
            input.value = '';
            draft = null;
            showFeedback('received');
        } catch (failure) {
            showFeedback(failure.name === 'AbortError' ? 'timeout' : 'unavailable');
        } finally {
            window.clearTimeout(timeout);
            sending = false;
            updateControls();
            input.focus({ preventScroll: true });
        }
    });
    input.addEventListener('input', () => showFeedback(''));
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; });
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing && !composing && event.keyCode !== 229) {
            event.preventDefault();
            form.requestSubmit();
        }
    });
    new MutationObserver(localize).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    localize();
    updateControls();
})();
