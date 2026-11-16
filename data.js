(function (root) {
    'use strict';
    var base = 'https://onhockey.tv/';
    // Older MSX WebViews reject Fly's TLS. On GitHub Pages both the UI and
    // the regularly refreshed schedule snapshot come from the same host.
    var githubPages = /(^|\.)github\.io$/i.test(window.location.hostname);
    function clean(value) { return (value || '').replace(/\s+/g, ' ').trim(); }
    function sourceGroupLabel(value) {
        var group = clean(value).replace(/:$/, '');
        if (!group) { return 'Other'; }
        return group.replace(/\b[a-z]/g, function (letter) { return letter.toUpperCase(); });
    }
    // Providers below currently show an unusable player on Samsung TV
    // (blocked response, CAPTCHA/ad overlay, or a permanently blank player).
    // Keep them out of the source picker until their embeds become reliable.
    var temporarilyDisabledSource = /(?:^|[^a-z0-9])(?:freestr|vidcdn|hlsst|lovecdn|vertex|nexast|streamc|korast|streamd|streammd|strmfr|xyzstr|embdm|mtchor|alieztv|ddlive|asiria|plytvme|fluidtv|rutube)(?:$|[^a-z0-9])/i;
    function localTime(value) {
        var match = /^(\d{1,2}):(\d{2})$/.exec(clean(value));
        if (!match) { return clean(value); }
        var total = parseInt(match[1], 10) * 60 + parseInt(match[2], 10) - new Date().getTimezoneOffset();
        total = ((total % 1440) + 1440) % 1440;
        var hours = Math.floor(total / 60);
        var minutes = total % 60;
        return (hours < 10 ? '0' : '') + hours + ':' + (minutes < 10 ? '0' : '') + minutes;
    }
    function timezoneLabel() {
        var offset = -new Date().getTimezoneOffset();
        var sign = offset >= 0 ? '+' : '-';
        var absoluteOffset = Math.abs(offset);
        var hours = Math.floor(absoluteOffset / 60);
        var minutes = absoluteOffset % 60;
        return 'UTC' + sign + hours + (minutes ? ':' + (minutes < 10 ? '0' : '') + minutes : '');
    }
    function decodeSchedule(bytes) {
        var upper = '\u0402\u0403\u201a\u0453\u201e\u2026\u2020\u2021\u20ac\u2030\u0409\u2039\u040a\u040c\u040b\u040f\u0452\u2018\u2019\u201c\u201d\u2022\u2013\u2014\ufffd\u2122\u0459\u203a\u045a\u045c\u045b\u045f\u00a0\u040e\u045e\u0408\u00a4\u0490\u00a6\u00a7\u0401\u00a9\u0404\u00ab\u00ac\u00ad\u00ae\u0407\u00b0\u00b1\u0406\u0456\u0491\u00b5\u00b6\u00b7\u0451\u2116\u0454\u00bb\u0458\u0405\u0455\u0457';
        var decoded = [];
        for (var byteIndex = 0; byteIndex < bytes.length; byteIndex += 1) {
            var value = bytes[byteIndex];
            decoded.push(value < 128 ? String.fromCharCode(value) : value < 192 ? upper.charAt(value - 128) : String.fromCharCode(1040 + value - 192));
        }
        return decoded.join('');
    }
    function absolute(value, origin) {
        if (!value || /^(javascript|data|file):/i.test(value)) { return ''; }
        var doc = document.implementation.createHTMLDocument('');
        var baseNode = doc.createElement('base');
        baseNode.href = origin || base;
        doc.head.appendChild(baseNode);
        var anchor = doc.createElement('a');
        anchor.href = value;
        return /^https?:/.test(anchor.href) ? anchor.href : '';
    }
    function playerFromLink(url) {
        var youtube = /^https:\/\/onhockey\.tv\/np_youtube\.php\?channel=([A-Za-z0-9_-]{11})$/i.exec(url);
        if (youtube) {
            return {type:'embedded', url:'https://www.youtube-nocookie.com/embed/' + youtube[1] + '?autoplay=1&playsinline=1&controls=1&rel=0&enablejsapi=1&mute=1'};
        }
        var vk = /^https:\/\/onhockey\.tv\/np_vk\.php\?channel=([^#]+)$/i.exec(url);
        if (vk) {
            var vkChannel;
            try { vkChannel = decodeURIComponent(vk[1]); } catch (error) { return null; }
            var vkParts = /^(-?\d+)&id=(\d+)$/.exec(vkChannel);
            if (vkParts) {
                return {type:'embedded', url:'https://vk.com/video_ext.php?oid=' + vkParts[1] + '&id=' + vkParts[2] + '&hd=2&autoplay=1'};
            }
        }
        var webcaster = /^https:\/\/onhockey\.tv\/np_webcaster\.php\?channel=([^#]+)$/i.exec(url);
        if (webcaster) {
            var webcasterChannel;
            try { webcasterChannel = decodeURIComponent(webcaster[1]); } catch (error) { return null; }
            if (/^[a-z0-9_\-/]+$/i.test(webcasterChannel)) {
                return {type:'embedded', url:prepareWcaster('https://www.webcaster.pro/iframe/feed/start/' + webcasterChannel)};
            }
        }
        var match = /^https:\/\/onhockey\.tv\/np_(?:stream400|webcaster)\.php\?channel=(.+)$/i.exec(url);
        if (!match) { return null; }
        var channel = match[1];
        if (/^(?:%2f%2f|https?%3a)/i.test(channel)) {
            try { channel = decodeURIComponent(channel); } catch (error) { return null; }
        }
        if (!/^(https?:)?\/\//i.test(channel)) { return null; }
        var target = absolute(channel, base);
        if (!target || /^https?:\/\/(www\.)?onhockey\.tv(?:[/:]|$)/i.test(target)) { return null; }
        return {type:/\.(m3u8|mp4|mpd)(\?|$)/i.test(target) ? 'direct' : 'embedded', url:target};
    }
    function hasDirectAdapter(url) {
        return /^https:\/\/(?:wikisport\.info|xstream\.st|matchora\.to)\//i.test(url);
    }
    function decodeStreamValue(value) {
        return (value || '')
            .replace(/\\u([0-9a-f]{4})/gi, function (_, hex) { return String.fromCharCode(parseInt(hex, 16)); })
            .replace(/\\x([0-9a-f]{2})/gi, function (_, hex) { return String.fromCharCode(parseInt(hex, 16)); })
            .replace(/\\\//g, '/')
            .replace(/\\"/g, '"')
            .replace(/&amp;/gi, '&');
    }
    function directStreamFromHtml(html, origin) {
        var candidates = [];
        var normalized = decodeStreamValue(html || '');
        var pattern = /(?:https?:)?\/\/[^\"'<>\\\s]+\.(?:m3u8|mp4|mpd)(?:\?[^\"'<>\\\s]*)?/ig;
        var match;
        while ((match = pattern.exec(normalized))) {
            var candidate = absolute(match[0], origin);
            if (candidate && candidates.indexOf(candidate) < 0) { candidates.push(candidate); }
        }
        var relativePattern = /(?:[\"'(=\s])((?:\/|\.\/)[^\"'<>\\\s]+\.(?:m3u8|mp4|mpd)(?:\?[^\"'<>\\\s]*)?)/ig;
        while ((match = relativePattern.exec(normalized))) {
            var relativeCandidate = absolute(match[1], origin);
            if (relativeCandidate && candidates.indexOf(relativeCandidate) < 0) { candidates.push(relativeCandidate); }
        }
        for (var index = 0; index < candidates.length; index += 1) {
            if (/\.m3u8(?:\?|$)/i.test(candidates[index])) { return {type:'direct', url:candidates[index]}; }
        }
        if (candidates.length) { return {type:'direct', url:candidates[0]}; }
        return null;
    }
    function prepareWcaster(url) {
        if (!/^https:\/\/(?:www\.)?webcaster\.pro\/iframe\/feed\/start\//i.test(url)) { return url; }
        var parts = url.split('?');
        var query = parts.length > 1 ? parts.slice(1).join('?') : '';
        var values = [];
        query.split('&').forEach(function (item) {
            if (!item || /^(?:width|height|iframe_width|iframe_height|autostart|muted|autostart_with_sound)=/i.test(item)) { return; }
            values.push(item);
        });
        values.push('width=1920', 'height=1080', 'iframe_width=1920', 'iframe_height=1080', 'autostart=1', 'autostart_with_sound=true', 'muted=0');
        return url.replace(/^https:\/\/(?:www\.)?webcaster\.pro/i, 'https://www.webcaster.pro').split('?')[0] + '?' + values.join('&');
    }
    function resolveProvider(html, origin) {
        if (/^https:\/\/matchora\.to\//i.test(origin)) {
            var matchoraStream = directStreamFromHtml(html, origin);
            if (matchoraStream) { return matchoraStream; }
            try {
                return resolvePlayer(html, origin);
            } catch (error) {
                throw new Error('Matchora не отдал прямой HLS-поток и не показал вложенный плеер. Поток создаётся скриптом или защищён авторизацией.');
            }
        }
        if (/^https:\/\/xstream\.st\//i.test(origin)) {
            var match = /\bconst\s+streamUrls\s*=\s*(\[[^\r\n;]{1,20000}\])\s*;/.exec(html);
            if (match) {
                var urls = JSON.parse(match[1]);
                for (var index = 0; index < urls.length; index += 1) {
                    if (typeof urls[index] !== 'string') { continue; }
                    var mediaUrl = absolute(urls[index], origin);
                    if (/^https:\/\/.+\.m3u8(?:\?|$)/i.test(mediaUrl)) { return {type:'direct', url:mediaUrl}; }
                }
            }
        }
        if (/^https:\/\/wikisport\.info\//i.test(origin)) {
            var target = resolvePlayer(html, origin);
            if (/^https:\/\/xstream\.st\//i.test(target.url)) { return target; }
        }
        throw new Error('Прямой поток freestr не найден. Выберите VK Live или другой источник.');
    }
    function resolvePlayer(html, origin) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var media = doc.querySelector('video[src], video source[src]');
        var mediaUrl = media && absolute(media.getAttribute('src'), origin);
        if (mediaUrl && /\.(m3u8|mp4|mpd)(\?|$)/i.test(mediaUrl)) { return {type:'direct', url:mediaUrl}; }
        var frames = doc.querySelectorAll('iframe[src]');
        for (var frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
            var frame = frames[frameIndex];
            var url = absolute(frame.getAttribute('src'), origin);
            var width = parseInt(frame.getAttribute('width'), 10);
            var height = parseInt(frame.getAttribute('height'), 10);
            var fullscreen = frame.hasAttribute('allowfullscreen') || frame.hasAttribute('webkitallowfullscreen') || frame.hasAttribute('mozallowfullscreen');
            if (!url || /^https?:\/\/(www\.)?onhockey\.tv(?:[/:]|$)/i.test(url)) { continue; }
            if (frame.hasAttribute('hidden') || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(frame.getAttribute('style') || '')) { continue; }
            if ((width >= 300 && height >= 200) || (fullscreen && !(width < 100 || height < 100)) || (isNaN(width) && isNaN(height))) { return {type:'embedded', url:prepareWcaster(url)}; }
        }
        throw new Error('В странице источника не найден поддерживаемый плеер. Выберите другой источник.');
    }
    function parseSchedule(html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        if (!doc.querySelector('#gametable')) { throw new Error('Сайт не вернул расписание. Возможно, требуется проверка доступа или изменился формат.'); }
        var rows = doc.querySelectorAll('#gametable tr.game');
        var games = [];
        var leagueSections = [];
        for (var rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
            var row = rows[rowIndex];
            var cells = row.querySelectorAll('td');
            if (cells.length < 2) { continue; }
            var titleCell = cells[1].cloneNode(true);
            var extra = titleCell.querySelector('.gamelinks');
            if (extra) { extra.parentNode.removeChild(extra); }
            var section = row.parentNode;
            var leagueKey = leagueSections.indexOf(section);
            if (leagueKey < 0) { leagueKey = leagueSections.length; leagueSections.push(section); }
            var leagueNode = section.querySelector('tr:not(.game) b');
            var linksBox = row.querySelector('.gamelinks');
            var sources = [];
            var sourceGroup = 'Other';
            var linkNodes = linksBox ? linksBox.childNodes : [];
            for (var linkIndex = 0; linkIndex < linkNodes.length; linkIndex += 1) {
                var linkNode = linkNodes[linkIndex];
                if (linkNode.nodeType === 3) {
                    var groupMatch = /(?:^|\s)(home feed|away feed|russian|slovenian|croatian|finnish|swedish|czech|german|french|english|slovak|ukrainian|polish)\s*:/i.exec(clean(linkNode.textContent));
                    if (groupMatch) { sourceGroup = sourceGroupLabel(groupMatch[1]); }
                    continue;
                }
                if (linkNode.nodeType !== 1 || linkNode.tagName.toLowerCase() !== 'a') { continue; }
                var url = absolute(linkNode.getAttribute('href'));
                if (url && url.indexOf(base) === 0) {
                    var label = clean(linkNode.textContent);
                    var detail = clean(linkNode.getAttribute('title'));
                    if (!temporarilyDisabledSource.test(label + ' ' + detail + ' ' + url)) {
                        sources.push({url:url, label:label, detail:detail, group:sourceGroup});
                    }
                }
            }
            games.push({title:clean(titleCell.textContent), time:clean(cells[0].textContent), league:leagueNode ? clean(leagueNode.textContent) : 'Хоккей', leagueKey:leagueKey, sources:sources});
        }
        return games;
    }
    function downloadText(url, referer, callback) {
        if (!root.tizen || !tizen.download || !tizen.filesystem) {
            // GitHub Pages cannot run a proxy. It publishes a UTF-8 schedule
            // snapshot, refreshed by GitHub Actions every ten minutes.
            var cancelled = false;
            if (githubPages) {
                if (!/^https:\/\/onhockey\.tv\/schedule_table\.php/i.test(url)) {
                    callback(new Error('Этот источник требует серверный разбор и временно недоступен в версии GitHub Pages.'));
                    return function () {};
                }
                fetch('data/schedule.html?_=' + Date.now(), {cache:'no-store'})
                    .then(function (response) {
                        if (!response.ok) { throw new Error('Сервер вернул HTTP ' + response.status + '.'); }
                        return response.text();
                    })
                    .then(function (text) { if (!cancelled) { callback(null, text); } })
                    .catch(function (error) { if (!cancelled) { callback(error); } });
                return function () { cancelled = true; };
            }
            var endpoint = /^https:\/\/onhockey\.tv\/schedule_table\.php/i.test(url)
                ? '/api/schedule?_=' + Date.now()
                : '/api/proxy?url=' + encodeURIComponent(url) + '&referer=' + encodeURIComponent(referer || base);
            fetch(endpoint, {cache:'no-store', credentials:'same-origin'})
                .then(function (response) {
                    if (!response.ok) { throw new Error('Сервер вернул HTTP ' + response.status + '.'); }
                    return response.text();
                })
                .then(function (text) { if (!cancelled) { callback(null, text); } })
                .catch(function (error) { if (!cancelled) { callback(error); } });
            return function () { cancelled = true; };
        }
        var finished = false;
        var downloadId;
        var filePath;
        function removeFile() {
            if (!filePath) { return; }
            tizen.filesystem.resolve(filePath, function (file) {
                if (file.parent) { file.parent.deleteFile(file.fullPath, function () {}, function () {}); }
            }, function () {}, 'rw');
        }
        function finish(error, text) {
            if (finished) { return; }
            finished = true;
            clearTimeout(timeout);
            removeFile();
            callback(error, text);
        }
        var timeout = setTimeout(function () {
            finish(new Error('Сайт не ответил за 25 секунд. Повторите загрузку.'));
            if (downloadId !== undefined) { try { tizen.download.cancel(downloadId); } catch (error) {} }
        }, 25000);
        try {
            var request = new tizen.DownloadRequest(url, 'downloads', 'hockey-live-' + Date.now() + '-' + Math.floor(Math.random() * 100000) + '.html', 'ALL', {Referer:referer || base, 'Cache-Control':'no-cache'});
            downloadId = tizen.download.start(request, {
                onprogress:function (identifier, received) {
                    if (received > 3000000) {
                        finish(new Error('Ответ сайта слишком большой.'));
                        try { tizen.download.cancel(identifier); } catch (error) {}
                    }
                },
                oncompleted:function (identifier, path) {
                    filePath = path;
                    if (finished) { removeFile(); return; }
                    tizen.filesystem.resolve(path, function (file) {
                        if (file.fileSize > 3000000) { finish(new Error('Ответ сайта слишком большой.')); return; }
                        if (url.indexOf(base + 'schedule_table.php') === 0) {
                            file.openStream('r', function (stream) {
                                try {
                                    var text = decodeSchedule(stream.readBytes(file.fileSize));
                                    stream.close(); finish(null, text);
                                } catch (error) {
                                    try { stream.close(); } catch (closeError) {}
                                    finish(error);
                                }
                            }, function (error) { finish(error); });
                        } else {
                            file.readAsText(function (text) { finish(null, text); }, function (error) { finish(error); }, 'UTF-8');
                        }
                    }, function (error) { finish(error); }, 'r');
                },
                onfailed:function (identifier, error) { finish(error); },
                oncanceled:function () { finish(new Error('Загрузка отменена.')); }
            });
        } catch (error) { finish(error); }
        return function () {
            if (finished) { return; }
            finished = true;
            clearTimeout(timeout);
            removeFile();
            if (downloadId !== undefined) { try { tizen.download.cancel(downloadId); } catch (error) {} }
        };
    }
    root.HockeyData = {base:base, absolute:absolute, parseSchedule:parseSchedule, localTime:localTime, timezoneLabel:timezoneLabel, downloadText:downloadText, decodeSchedule:decodeSchedule, resolvePlayer:resolvePlayer, playerFromLink:playerFromLink, hasDirectAdapter:hasDirectAdapter, resolveProvider:resolveProvider, prepareWcaster:prepareWcaster};
}(window));
