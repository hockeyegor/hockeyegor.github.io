(function (root) {
    'use strict';
    function parse(url) {
        var anchor = document.createElement('a');
        anchor.href = url;
        if (!/^https?:$/.test(anchor.protocol) || !/^(?:www\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)$/.test(anchor.hostname)) { return null; }
        var video = '';
        var channel = '';
        var parts = anchor.pathname.split('/');
        if (anchor.hostname === 'youtu.be') { video = parts[1]; }
        else if (parts[1] === 'embed' || parts[1] === 'live' || parts[1] === 'shorts') { video = parts[2]; }
        else if (parts[1] === 'channel') { channel = parts[2]; }
        var parameters = {};
        anchor.search.slice(1).split('&').forEach(function (pair) {
            var values = pair.split('=');
            try { parameters[values[0]] = decodeURIComponent(values.slice(1).join('=')); } catch (error) {}
        });
        if (anchor.pathname === '/watch') { video = parameters.v; }
        if (video === 'live_stream') { video = ''; channel = parameters.channel; }
        if (/^[A-Za-z0-9_-]{11}$/.test(video || '')) { return {video:video}; }
        if (/^UC[A-Za-z0-9_-]{22}$/.test(channel || '')) { return {channel:channel}; }
        return {invalid:true};
    }
    function connect(frame, target, onBack) {
        if (target.invalid) { throw new Error('Не удалось определить видео YouTube.'); }
        var origin = 'https://www.youtube-nocookie.com';
        var session = Date.now().toString(36) + Math.random().toString(36).slice(2);
        function requestSound() {
            frame.contentWindow.postMessage(JSON.stringify({event:'command',func:'unMute',args:[]}), origin);
            frame.contentWindow.postMessage(JSON.stringify({event:'command',func:'setVolume',args:[100]}), origin);
            frame.contentWindow.postMessage(JSON.stringify({event:'command',func:'playVideo',args:[]}), origin);
        }
        function receive(event) {
            if (event.source !== frame.contentWindow || event.origin !== origin || !event.data) { return; }
            var data = event.data;
            if (typeof data === 'string') { try { data = JSON.parse(data); } catch (error) { return; } }
            if (data.event === 'onReady') { requestSound(); }
        }
        window.addEventListener('message', receive);
        var query = target.video ? 'video_id=' + target.video : 'channel=' + target.channel;
        var embed = target.video ? target.video : 'live_stream';
        // Start muted so autoplay is allowed on mobile/MSX browsers. The
        // host sound button sends unMute after the user's interaction.
        frame.src = 'https://www.youtube-nocookie.com/embed/' + embed + '?' + query + '&autoplay=1&playsinline=1&controls=1&rel=0&enablejsapi=1&mute=1';
        return {
            sound:function () {
                requestSound();
            },
            toggle:function (command) {
                var func = (command === 415 || command === 19) ? 'playVideo' : 'pauseVideo';
                frame.contentWindow.postMessage(JSON.stringify({event:'command',func:func,args:[]}), origin);
            },
            destroy:function () { window.removeEventListener('message',receive); }
        };
    }
    root.HockeyYouTube = {parse:parse,connect:connect};
}(window));
