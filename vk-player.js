(function (root) {
    'use strict';
    function isVK(url) { return /^https:\/\/(?:vkvideo\.ru|vk\.com|vk\.ru)\/video_(?:ext|embed)\.php\?/i.test(url); }
    function prepare(url) {
        return url.replace(/([?&])(?:js_api|muted)=[^&#]*/g, '$1').replace(/\?&/, '?').replace(/&&+/g, '&').replace(/[?&]$/, '') + '&js_api=1&muted=0';
    }
    function connect(frame, changed) {
        var origin = /^https:\/\/[^/]+/.exec(frame.src)[0];
        var ready = false;
        var active = true;
        var requestedSound = false;
        var state = 'uninited';
        function send(method, extra) {
            if (!active) { return; }
            var message = extra || {};
            message.method = method;
            frame.contentWindow.postMessage(message, origin);
        }
        function enableSound() {
            requestedSound = true;
            if (!ready) { changed('Звук включится после готовности VK-плеера.'); return; }
            send('set_volume', {volume:1});
            send('unmute');
            changed('Команда включения звука отправлена в VK.');
        }
        function receive(event) {
            if (!active || event.source !== frame.contentWindow || event.origin !== origin || !event.data || typeof event.data !== 'object') { return; }
            var data = event.data;
            if (typeof data.state === 'string') { state = data.state; }
            if (data.event === 'inited') {
                ready = true;
                clearInterval(handshake);
                if (requestedSound) { enableSound(); }
            }
            if (data.event === 'volumechange') {
                changed(data.muted || data.volume === 0 ? 'VK: звук выключен. Нажмите «Включить звук».' : 'VK подтвердил включённый звук. Громкость регулируется пультом ТВ.');
            }
            if (data.event === 'autoplaySoundProhibited') {
                changed('VK запретил автоматический звук. Нажмите «Включить звук» с пульта.');
            }
        }
        window.addEventListener('message', receive);
        var attempts = 0;
        var handshake = setInterval(function () {
            attempts += 1;
            if (attempts > 15) { clearInterval(handshake); changed('VK не ответил на команды. Попробуйте перезапустить источник.'); return; }
            send('init');
        }, 1000);
        send('init');
        return {
            unmute:enableSound,
            toggle:function (command) {
                if (!ready) { changed('VK-плеер ещё загружается.'); return; }
                send(command === 415 ? 'play' : command === 19 ? 'pause' : state === 'playing' ? 'pause' : 'play');
            },
            destroy:function () { active = false; clearInterval(handshake); window.removeEventListener('message', receive); }
        };
    }
    root.HockeyVK = {isVK:isVK, prepare:prepare, connect:connect};
}(window));
