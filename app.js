(function () {
    'use strict';
    var games = [];
    var selectedGame = null;
    var playbackGame = null;
    var selectedSource = null;
    var sourcesOnly = true;
    var activeLeagueKey = null;
    var busy = false;
    var playing = false;
    var nativePlayer = false;
    var nativeVideo = null;
    var generation = 0;
    var hideTimer;
    var savedFocus;
    var sourceFocus;
    var savedListScrollTop = 0;
    var lastMatchFocus = null;
    var lastSelectedGame = null;
    var cancelSource;
    var focusTimer;
    var youtubeFocusTimer;
    var lastBackAt = 0;
    var playerMenuOpened = false;
    var embeddedAutoSoundTimer;
    var wcasterActive = false;
    var wcasterAutoSoundTimer;
    var embeddedSoundActive = false;
    var embeddedFocusMode = false;
    var vkPlayer;
    var youtubePlayer;
    var soundButton = document.createElement('button');
    soundButton.id = 'unmutePlayer';
    soundButton.textContent = 'Включить звук';
    soundButton.className = 'hidden';
    element('playerbar').insertBefore(soundButton, element('playerStatus'));
    soundButton.onclick = function () {
        if (youtubePlayer) { youtubePlayer.sound(); element('playerStatus').textContent = 'Команда включения звука отправлена в YouTube.'; showPlayerBar(); return; }
        if (vkPlayer) { vkPlayer.unmute(); showPlayerBar(); return; }
        if (nativePlayer && window.webapis && webapis.avplay) {
            enableNativeAudio();
            element('playerStatus').textContent = 'Громкость AVPlay установлена на 100%.';
            showPlayerBar(); return;
        }
        if (nativeVideo) {
            nativeVideo.muted = false;
            nativeVideo.volume = 1;
            nativeVideo.play().then(function () {
                element('playerStatus').textContent = 'Звук включён.';
            }).catch(function () {
                element('playerStatus').textContent = 'Браузер не разрешил автоматический запуск звука.';
            });
            showPlayerBar(); return;
        }
        if (embeddedSoundActive) {
            clearTimeout(wcasterAutoSoundTimer);
            tryEmbeddedSound();
            element('playerStatus').textContent = 'Команда включения звука отправлена в плеер.';
            showPlayerBar();
        }
    };
    function tryEmbeddedSound() {
        var frame = element('webplayer');
        if (!frame || !frame.contentWindow) { return; }
        var messages = [
            {type:'play'},
            {command:'play'},
            {method:'play'},
            {event:'play'},
            {type:'unmute'},
            {command:'unmute'},
            {method:'unmute'},
            {type:'setMuted', muted:false},
            {command:'setMuted', muted:false},
            {method:'setMuted', muted:false},
            {type:'volume', volume:1},
            {command:'volume', volume:1},
            {method:'volume', volume:1},
            {type:'setVolume', volume:1},
            {command:'setVolume', volume:1},
            {event:'unmute'}
        ];
        for (var index = 0; index < messages.length; index += 1) {
            try { frame.contentWindow.postMessage(messages[index], '*'); } catch (error) {}
        }
    }
    function focusEmbeddedPlayer() {
        var frame = element('webplayer');
        if (!frame) { return; }
        // On some TV WebKit versions focusing the iframe element alone keeps
        // key events in the parent document. Focusing its browsing context as
        // well gives the provider player a chance to receive remote input.
        try { if (frame.contentWindow) { frame.contentWindow.focus(); } } catch (error) {}
        try { frame.focus(); } catch (error) {}
    }
    function enableNativeAudio() {
        if (!window.webapis || !webapis.avplay) { return; }
        try { if (typeof webapis.avplay.setMute === 'function') { webapis.avplay.setMute(false); } } catch (error) {}
        try { webapis.avplay.setVolume(100); } catch (error) {}
        try {
            if (typeof webapis.avplay.getTotalTrackInfo !== 'function' || typeof webapis.avplay.setSelectTrack !== 'function') { return; }
            var tracks = webapis.avplay.getTotalTrackInfo() || [];
            for (var trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
                var track = tracks[trackIndex] || {};
                if (String(track.type || '').toUpperCase() === 'AUDIO') {
                    webapis.avplay.setSelectTrack('AUDIO', Number(track.index));
                    break;
                }
            }
        } catch (error) {}
    }
    function releaseFrame() {
        var oldFrame = element('webplayer');
        var freshFrame = oldFrame.cloneNode(false);
        freshFrame.className = 'hidden';
        freshFrame.style.cssText = '';
        freshFrame.src = 'about:blank';
        oldFrame.parentNode.replaceChild(freshFrame, oldFrame);
    }
    function restoreSourceFocus() {
        if (sourceFocus && document.body.contains(sourceFocus)) { sourceFocus.focus(); }
        else { focusFirst(); }
    }
    function element(identifier) { return document.getElementById(identifier); }
    function status(text) { element('status').textContent = text; }
    function showModal(title, text, canExit) {
        savedFocus = document.activeElement;
        element('modalTitle').textContent = title;
        element('modalText').textContent = text;
        element('exit').className = canExit ? '' : 'hidden';
        element('modal').className = '';
        element('dismiss').focus();
    }
    function dismiss() {
        element('modal').className = 'hidden';
        if (savedFocus && document.body.contains(savedFocus)) { savedFocus.focus(); }
    }
    function addCard(meta, title, action, container) {
        var button = document.createElement('button');
        button.className = 'card';
        var label = document.createElement('span');
        label.className = 'meta'; label.textContent = meta;
        var name = document.createElement('span');
        name.className = 'title'; name.textContent = title;
        button.appendChild(label); button.appendChild(name);
        button.onclick = action;
        (container || element('list')).appendChild(button);
        return button;
    }
    function renderSelectedLeagueMenu() {
        var leagueButtons = element('leagueButtons');
        var seen = {};
        leagueButtons.textContent = '';
        var allButton = document.createElement('button');
        allButton.className = 'league-button';
        allButton.setAttribute('data-league-key', '');
        allButton.textContent = 'Все матчи';
        allButton.onclick = function () {
            selectedGame = null;
            activeLeagueKey = null;
            render();
            focusFirst();
        };
        leagueButtons.appendChild(allButton);
        games.forEach(function (game) {
            if (seen[game.leagueKey]) { return; }
            seen[game.leagueKey] = true;
            var leagueButton = document.createElement('button');
            leagueButton.className = 'league-button' + (String(game.leagueKey) === String(selectedGame.leagueKey) ? ' active' : '');
            leagueButton.setAttribute('data-league-key', game.leagueKey);
            leagueButton.textContent = game.league;
            leagueButton.onclick = function () {
                selectedGame = null;
                activeLeagueKey = game.leagueKey;
                render();
                focusLeagueSection(game.leagueKey);
            };
            leagueButtons.appendChild(leagueButton);
        });
    }
    function render() {
        var list = element('list');
        var sourceList = element('sourceList');
        var leagueButtons = element('leagueButtons');
        element('filter').textContent = sourcesOnly ? 'Расписание' : 'В эфире';
        list.textContent = '';
        sourceList.textContent = '';
        leagueButtons.textContent = '';
        element('list').className = selectedGame ? '' : 'league-list';
        element('sourcePanel').className = selectedGame ? 'selected' : '';
        if (selectedGame) {
            element('featuredKicker').textContent = '● LIVE · ' + selectedGame.league;
            element('heading').textContent = selectedGame.title;
            status(HockeyData.localTime(selectedGame.time) + ' ' + HockeyData.timezoneLabel() + ' · Выберите источник · ' + selectedGame.sources.length + ' доступных');
            var selectedCard = document.createElement('section');
            selectedCard.className = 'selected-match';
            var selectedKicker = document.createElement('p');
            selectedKicker.className = 'selected-match-kicker';
            selectedKicker.textContent = selectedGame.league + ' · ' + HockeyData.localTime(selectedGame.time) + ' ' + HockeyData.timezoneLabel();
            var selectedTitle = document.createElement('h2');
            selectedTitle.textContent = selectedGame.title;
            var selectedInfo = document.createElement('p');
            selectedInfo.textContent = selectedGame.sources.length ? 'Выберите трансляцию справа · ' + selectedGame.sources.length + ' источников' : 'Источники для этого матча ещё не опубликованы';
            selectedCard.appendChild(selectedKicker);
            selectedCard.appendChild(selectedTitle);
            selectedCard.appendChild(selectedInfo);
            list.appendChild(selectedCard);
            element('sourceHint').textContent = selectedGame.sources.length ? 'Выберите источник трансляции.' : 'Для этого матча источники ещё не опубликованы.';
            var currentSourceGroup = '';
            selectedGame.sources.forEach(function (source, index) {
                var sourceGroup = source.group || 'Other';
                if (sourceGroup !== currentSourceGroup) {
                    var groupHeading = document.createElement('h3');
                    groupHeading.className = 'source-group-title';
                    groupHeading.textContent = sourceGroup;
                    sourceList.appendChild(groupHeading);
                    currentSourceGroup = sourceGroup;
                }
                var sourceButton = document.createElement('button');
                sourceButton.className = 'source card' + (index === 0 ? ' primary' : '');
                sourceButton.textContent = (index === 0 ? '▶ ' : '') + (source.label || 'Источник ' + (index + 1));
                sourceButton.onclick = function () { play(source); };
                sourceList.appendChild(sourceButton);
            });
            renderSelectedLeagueMenu();
        } else {
            element('featuredKicker').textContent = 'ХОККЕЙ НА БОЛЬШОМ ЭКРАНЕ';
            element('heading').textContent = 'Расписание матчей';
            element('sourceHint').textContent = 'Выберите матч, чтобы увидеть доступные трансляции.';
            var groups = [];
            var visibleCount = 0;
            games.forEach(function (game) {
                if (sourcesOnly && !game.sources.length) { return; }
                if (activeLeagueKey !== null && String(game.leagueKey) !== String(activeLeagueKey)) { return; }
                visibleCount += 1;
                var group = null;
                for (var groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
                    if (groups[groupIndex].key === game.leagueKey) { group = groups[groupIndex]; break; }
                }
                if (!group) { group = {key:game.leagueKey, title:game.league, games:[]}; groups.push(group); }
                group.games.push(game);
            });
            status(visibleCount + ' матчей · Местное время ТВ (' + HockeyData.timezoneLabel() + ')');
            var allButton = document.createElement('button');
            allButton.className = 'league-button' + (activeLeagueKey === null ? ' active' : '');
            allButton.setAttribute('data-league-key', '');
            allButton.textContent = 'Все матчи';
            allButton.onclick = function () { activeLeagueKey = null; element('list').scrollTop = 0; render(); focusFirst(); };
            leagueButtons.appendChild(allButton);
            groups.forEach(function (group, groupIndex) {
                var leagueButton = document.createElement('button');
                leagueButton.className = 'league-button' + (activeLeagueKey === group.key ? ' active' : '');
                leagueButton.setAttribute('data-league-key', group.key);
                leagueButton.textContent = group.title;
                leagueButton.onclick = function () {
                    activeLeagueKey = group.key;
                    render();
                    focusLeagueSection(group.key);
                };
                leagueButtons.appendChild(leagueButton);
                var section = document.createElement('section');
                section.className = 'league-section';
                section.setAttribute('data-league-key', group.key);
                var heading = document.createElement('h2');
                heading.id = 'league-' + groupIndex;
                heading.className = 'league-heading';
                heading.textContent = group.title;
                var count = document.createElement('span');
                count.textContent = 'Матчей: ' + group.games.length;
                heading.appendChild(count);
                section.setAttribute('aria-labelledby', heading.id);
                section.appendChild(heading);
                var cards = document.createElement('div');
                cards.className = 'league-games';
                section.appendChild(cards);
                list.appendChild(section);
                group.games.forEach(function (game) {
                    var gameButton = addCard(game.league + ' · ' + HockeyData.localTime(game.time) + ' ' + HockeyData.timezoneLabel() + ' · ' + game.sources.length + ' источников', game.title, function () {
                        savedListScrollTop = list.scrollTop;
                        lastSelectedGame = game;
                        selectedGame = game; render(); focusFirst();
                    }, cards);
                    gameButton.className += ' match-card';
                    gameButton.gameRef = game;
                });
            });
        }
        if (!list.children.length && !selectedGame) {
            var empty = document.createElement('p'); empty.className = 'empty';
            empty.textContent = 'Нет матчей для выбранного фильтра.';
            list.appendChild(empty);
        }
        if (selectedGame && !sourceList.children.length) {
            var noSources = document.createElement('p'); noSources.className = 'empty';
            noSources.textContent = 'Источники ещё не опубликованы.';
            sourceList.appendChild(noSources);
        }
    }
    function focusFirst() {
        var first = selectedGame ? element('sourceList').querySelector('button') : element('list').querySelector('button');
        (first || element('leagueButtons').querySelector('button') || element('refresh')).focus();
    }
    function focusGame(game) {
        var cards = element('list').querySelectorAll('.card');
        for (var index = 0; index < cards.length; index += 1) {
            if (cards[index].gameRef === game) {
                cards[index].focus();
                lastMatchFocus = cards[index];
                return;
            }
        }
        focusFirst();
    }
    function focusLeagueSection(key) {
        var sections = element('list').querySelectorAll('.league-section');
        for (var index = 0; index < sections.length; index += 1) {
            if (String(sections[index].getAttribute('data-league-key')) !== String(key)) { continue; }
            element('list').scrollTop = Math.max(0, sections[index].offsetTop - 8);
            var firstCard = sections[index].querySelector('.card');
            (firstCard || element('leagueButtons').querySelector('button')).focus();
            return;
        }
        focusFirst();
    }
    function load() {
        if (busy || playing) { return; }
        busy = true; status('Загрузка актуального расписания…');
        HockeyData.downloadText(HockeyData.base + 'schedule_table.php?_=' + Date.now(), HockeyData.base, function (error, html) {
            busy = false;
            if (error) { status('Не удалось обновить: ' + (error.message || error.name)); return; }
            try { games = HockeyData.parseSchedule(html); }
            catch (parseError) { status(parseError.message); return; }
            selectedGame = null; playbackGame = null; activeLeagueKey = null;
            render(); status(games.length + ' матчей · Обновлено ' + new Date().toLocaleTimeString()); focusFirst();
        });
    }
    function showPlayerBar() {
        element('playerbar').className = '';
        element('playerTouchGuard').className = window.tizen ? 'hidden' : '';
        clearTimeout(hideTimer);
        hideTimer = setTimeout(function () {
            if (playing) {
                element('playerbar').className = 'dim';
                // Keep the transparent guard active in the browser build so
                // the next tap opens our menu instead of the iframe player.
                element('playerTouchGuard').className = window.tizen ? 'hidden' : '';
                playerMenuOpened = false;
            }
        }, 7000);
    }
    function stop() {
        generation += 1; playing = false; clearTimeout(hideTimer);
        clearInterval(focusTimer);
        clearInterval(youtubeFocusTimer);
        embeddedFocusMode = false;
        wcasterActive = false;
        embeddedSoundActive = false;
        clearTimeout(wcasterAutoSoundTimer);
        clearInterval(embeddedAutoSoundTimer);
        embeddedAutoSoundTimer = null;
        playerMenuOpened = false;
        if (vkPlayer) { vkPlayer.destroy(); vkPlayer = null; }
        if (youtubePlayer) { youtubePlayer.destroy(); youtubePlayer = null; }
        soundButton.className = 'hidden';
        element('playback').className = 'hidden';
        element('app').className = '';
        restoreSourceFocus();
        if (cancelSource) { cancelSource(); cancelSource = null; }
        releaseFrame();
        if (nativePlayer) {
            if (window.webapis && webapis.avplay) {
                try { webapis.avplay.stop(); } catch (error) {}
                try { webapis.avplay.close(); } catch (error) {}
            }
        }
        if (nativeVideo) {
            try { nativeVideo.pause(); nativeVideo.removeAttribute('src'); nativeVideo.load(); } catch (error) {}
            nativeVideo.className = 'hidden';
            nativeVideo = null;
        }
        nativePlayer = false;
    }
    function embedded(url) {
        nativePlayer = false;
        embeddedSoundActive = true;
        var youtube = HockeyYouTube.parse(url);
        if (youtube) {
            showPlayerBar();
            element('playerbar').className = '';
            element('webplayer').className = 'youtube-player';
            element('webplayer').style.cssText = 'top:0;left:0;width:100vw;height:100vh;';
            soundButton.className = '';
            try { youtubePlayer = HockeyYouTube.connect(element('webplayer'), youtube, back); }
            catch (error) { playerError(error.message); }
            // YouTube is intentionally controlled through the host buttons;
            // never leave the TV remote focused inside the cross-origin iframe.
            element('closePlayer').focus();
            clearInterval(youtubeFocusTimer);
            youtubeFocusTimer = setInterval(function () {
                if (!playing || !youtubePlayer) { return; }
                if (!element('playerbar').contains(document.activeElement)) {
                    element('closePlayer').focus();
                }
            }, 350);
            return;
        }
        var isVK = HockeyVK.isVK(url);
        if (isVK) { url = HockeyVK.prepare(url); }
        var isWcaster = /webcaster\.pro\/iframe\/feed\/start\//i.test(url);
        var isStreamc = /streamc/i.test(url);
        var isKorast = /korast/i.test(url);
        var isHlsst = /hlsst/i.test(url);
        wcasterActive = isWcaster;
        element('webplayer').className = '';
        element('webplayer').style.cssText = '';
        element('webplayer').src = url;
        element('webplayer').onload = function () {
            tryEmbeddedSound();
            setTimeout(tryEmbeddedSound, 1200);
            clearInterval(embeddedAutoSoundTimer);
            if (isStreamc || isKorast || isHlsst) {
                var soundAttempts = 0;
                embeddedAutoSoundTimer = setInterval(function () {
                    if (!playing || ++soundAttempts > 16) {
                        clearInterval(embeddedAutoSoundTimer);
                        embeddedAutoSoundTimer = null;
                        return;
                    }
                    tryEmbeddedSound();
                }, 500);
            }
            if (isWcaster) {
                soundButton.className = '';
                clearTimeout(wcasterAutoSoundTimer);
                wcasterAutoSoundTimer = setTimeout(function () {
                    if (!playing || !wcasterActive) { return; }
                    try {
                        element('webplayer').contentWindow.postMessage({type:'vjs_api', cmd:'setMode', cmd_p:JSON.stringify('setMaxMode')}, '*');
                        tryEmbeddedSound();
                        element('playerStatus').textContent = 'Wcaster: отправлена команда запуска со звуком.';
                    } catch (error) {}
                }, 3000);
            }
            if (playing) { soundButton.focus(); }
            // Let the TV remote control the provider's own player. The
            // system Back event below returns control to our application.
            if (!youtube && !isVK && playing) {
                embeddedFocusMode = true;
                element('playerStatus').textContent = 'Фокус передан плееру. Назад — вернуться в приложение.';
                setTimeout(function () {
                    if (playing && embeddedFocusMode) {
                        focusEmbeddedPlayer();
                    }
                }, 500);
            }
        };
        if (isVK) {
            soundButton.className = '';
            vkPlayer = HockeyVK.connect(element('webplayer'), function (message) {
                element('playerStatus').textContent = message; showPlayerBar();
            });
            vkPlayer.unmute(); soundButton.focus();
        } else {
            soundButton.className = '';
        }
        element('playerStatus').textContent = isVK ? 'VK Live: отправлена команда включения звука.' : isWcaster ? 'Wcaster: полноэкранный режим. Отправлена команда запуска со звуком.' : 'Плеер источника внутри приложения. Для некоторых источников может потребоваться кнопка включения звука.';
        showPlayerBar();
    }
    function playerError(message) {
        element('webplayer').src = 'about:blank';
        element('webplayer').className = 'hidden';
        element('playerStatus').textContent = message;
        showPlayerBar(); clearTimeout(hideTimer);
        element('closePlayer').focus();
    }
    function direct(url, token) {
        if (!window.webapis || !webapis.avplay) {
            nativePlayer = false;
            nativeVideo = element('nativeVideo');
            nativeVideo.className = '';
            nativeVideo.muted = false;
            nativeVideo.volume = 1;
            nativeVideo.src = url;
            nativeVideo.onloadedmetadata = function () {
                if (token !== generation) { return; }
                nativeVideo.play().then(function () {
                    element('playerStatus').textContent = 'Прямой поток · звук включён.';
                    showPlayerBar();
                }).catch(function () {
                    element('playerStatus').textContent = 'Нажмите OK или «Включить звук» для запуска потока.';
                    soundButton.className = '';
                    soundButton.focus();
                });
            };
            nativeVideo.onerror = function () {
                if (token === generation) { playerError('Браузер не смог воспроизвести прямой поток. Выберите другой источник.'); }
            };
            element('webplayer').className = 'hidden';
            soundButton.className = '';
            showPlayerBar();
            return;
        }
        try {
            nativePlayer = true;
            nativeVideo = null;
            element('webplayer').className = 'hidden';
            soundButton.className = '';
            webapis.avplay.open(url);
            webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
            enableNativeAudio();
            webapis.avplay.setListener({onerror:function () {
                if (token !== generation) { return; }
                element('playerStatus').textContent = 'Ошибка видео. Нажмите Назад и выберите другой источник.';
                showPlayerBar();
            }, onstreamcompleted:function () { if (token === generation) { stop(); focusFirst(); } }});
            webapis.avplay.prepareAsync(function () {
                if (token !== generation) { return; }
                enableNativeAudio();
                webapis.avplay.play(); element('playerStatus').textContent = 'Прямой поток · звук включён · Play/Pause или кнопка Пауза / Старт'; showPlayerBar();
            }, function () {
                if (token !== generation) { return; }
                try { webapis.avplay.close(); } catch (error) {}
                nativePlayer = false;
                playerError('Не удалось воспроизвести прямой поток. Выберите другой источник.');
            });
        } catch (error) {
            try { webapis.avplay.close(); } catch (closeError) {}
            nativePlayer = false;
            playerError('Не удалось открыть прямой поток. Выберите другой источник.');
        }
    }
    function openTarget(target, token, depth, referer) {
        if (token !== generation || !playing) { return; }
        if (target.type === 'direct') { direct(target.url, token); return; }
        if (!HockeyData.hasDirectAdapter(target.url)) { embedded(target.url); return; }
        if (depth >= 2) { playerError('Слишком много переходов источника. Выберите другой источник.'); return; }
        element('playerStatus').textContent = 'Получение прямого потока без запуска веб-плеера…';
        showPlayerBar(); clearTimeout(hideTimer);
        cancelSource = HockeyData.downloadText(target.url, referer || HockeyData.base, function (error, html) {
            if (token !== generation || !playing) { return; }
            if (error) { playerError('Не удалось получить прямой поток: ' + (error.message || error.name)); return; }
            try { openTarget(HockeyData.resolveProvider(html, target.url), token, depth + 1, target.url); }
            catch (resolveError) { playerError(resolveError.message); }
        });
    }
    function play(source) {
        if (!playing) {
            sourceFocus = document.activeElement;
            playbackGame = selectedGame;
        }
        stop(); selectedSource = source; playing = true; playerMenuOpened = false;
        var token = generation;
        element('app').className = 'hidden';
        element('playback').className = window.tizen ? '' : 'msx-playback';
        element('webplayer').className = 'hidden';
        element('playerTitle').textContent = selectedGame.title + ' · ' + source.label;
        element('playerStatus').textContent = 'Подключение к источнику…';
        element('closePlayer').focus(); showPlayerBar();
        if (/\.(m3u8|mp4|mpd)(\?|$)/i.test(source.url)) { direct(source.url, token); return; }
        var quickTarget = HockeyData.playerFromLink(source.url);
        if (quickTarget) {
            openTarget(quickTarget, token, 0, HockeyData.base);
            return;
        }
        cancelSource = HockeyData.downloadText(source.url, HockeyData.base, function (error, html) {
            if (token !== generation || !playing) { return; }
            if (error) { playerError('Не удалось получить плеер: ' + (error.message || error.name)); return; }
            try {
                var target = HockeyData.resolvePlayer(html, source.url);
                openTarget(target, token, 0, source.url);
            } catch (resolveError) { playerError(resolveError.message); }
        });
    }
    function toggle(command) {
        if (youtubePlayer) { youtubePlayer.toggle(command); return; }
        showPlayerBar();
        if (vkPlayer) { vkPlayer.toggle(command); return; }
        if (nativeVideo) {
            if (nativeVideo.paused) { nativeVideo.play().catch(function () {}); }
            else { nativeVideo.pause(); }
            return;
        }
        if (!nativePlayer) {
            if (embeddedSoundActive) {
                tryEmbeddedSound();
                element('playerStatus').textContent = 'Команда запуска и включения звука отправлена в плеер.';
                showPlayerBar();
                return;
            }
            element('playerStatus').textContent = 'Этот источник использует собственный плеер. Play/Pause приложения доступен только для прямых потоков.';
            return;
        }
        try {
            if (webapis.avplay.getState() === 'PLAYING' && command !== 415) { webapis.avplay.pause(); }
            else if (webapis.avplay.getState() === 'PAUSED' && command !== 19) { webapis.avplay.play(); }
        } catch (error) { element('playerStatus').textContent = 'Плеер ещё не готов.'; }
    }
    function returnToSources() {
        var gameToRestore = selectedGame || playbackGame;
        stop();
        if (!gameToRestore) {
            focusFirst();
            return;
        }
        selectedGame = gameToRestore;
        playbackGame = null;
        activeLeagueKey = null;
        render();
        focusFirst();
    }
    function back() {
        // Samsung can deliver one Back press through both the iframe bridge
        // and the application-level tizenhwkey/keydown handlers. Treat the
        // duplicate delivery as one press so we stop at the source list.
        var now = Date.now();
        if (now - lastBackAt < 700) { return; }
        lastBackAt = now;
        if (element('modal').className !== 'hidden') { dismiss(); return; }
        if (playing) {
            if (!playerMenuOpened) {
                playerMenuOpened = true;
                showPlayerBar();
                element('closePlayer').focus();
                return;
            }
            returnToSources();
            return;
        }
        if (selectedGame) {
            selectedGame = null; playbackGame = null;
            activeLeagueKey = null;
            render();
            element('list').scrollTop = savedListScrollTop;
            status(games.length + ' матчей · Местное время телевизора (' + HockeyData.timezoneLabel() + ')');
            load();
            return;
        }
        if (document.activeElement && document.activeElement.gameRef) {
            var currentMatch = document.activeElement;
            var currentMatchSection = currentMatch.parentNode && currentMatch.parentNode.parentNode;
            var currentMatchLeagueKey = currentMatchSection && currentMatchSection.getAttribute('data-league-key');
            var currentMatchLeagueButton = element('leagueButtons').querySelector('.league-button[data-league-key="' + currentMatchLeagueKey + '"]');
            if (currentMatchLeagueButton) {
                currentMatchLeagueButton.focus();
                return;
            }
        }
        if (activeLeagueKey !== null) {
            var leagueToRestore = activeLeagueKey;
            activeLeagueKey = null;
            render();
            var leagueButtonToRestore = element('leagueButtons').querySelector('.league-button[data-league-key="' + leagueToRestore + '"]');
            if (leagueButtonToRestore) { leagueButtonToRestore.focus(); }
            else { focusFirst(); }
            return;
        }
        showModal('Выйти из hockey.live?', 'Вы можете вернуться к расписанию или закрыть приложение.', true);
    }
    function move(key) {
        var scope = element('modal').className !== 'hidden' ? element('modal') : playing ? element('playerbar') : element('app');
        var buttons = Array.prototype.filter.call(scope.querySelectorAll('button'), function (button) { return button.offsetWidth > 0 && button.offsetHeight > 0; });
        var current = document.activeElement;
        if (buttons.indexOf(current) < 0) { if (buttons[0]) { buttons[0].focus(); } return; }

        var toolbar = element('toolbar');
        if (!playing && toolbar && toolbar.contains(current)) {
            var toolbarButtons = Array.prototype.filter.call(toolbar.querySelectorAll('button'), function (button) { return button.offsetWidth > 0 && button.offsetHeight > 0; });
            if (key === 37) {
                var toolbarIndex = toolbarButtons.indexOf(current);
                if (toolbarIndex > 0) {
                    toolbarButtons[toolbarIndex - 1].focus();
                    return;
                }
                var toolbarLeague = element('leagueButtons').querySelector('.league-button[data-league-key="' + (activeLeagueKey === null ? '' : activeLeagueKey) + '"]') || element('leagueButtons').querySelector('.league-button');
                if (toolbarLeague) { toolbarLeague.focus(); return; }
            }
            if (key === 40) {
                var toolbarDown = selectedGame ? element('sourceList').querySelector('.source') : element('list').querySelector('.match-card');
                if (toolbarDown) { toolbarDown.focus(); return; }
            }
            buttons = toolbarButtons;
        }

        // Keep directional navigation inside the active menu. The previous
        // global geometry search could jump from a league/source column to a
        // visually nearby card belonging to another league.
        if (!playing && current.classList && current.classList.contains('league-button')) {
            if (key === 39 && !selectedGame) {
                var leagueToolbarButton = element('toolbar').querySelector('button');
                if (leagueToolbarButton) { leagueToolbarButton.focus(); return; }
            }
            buttons = Array.prototype.filter.call(element('leagueButtons').querySelectorAll('.league-button'), function (button) { return button.offsetWidth > 0 && button.offsetHeight > 0; });
        } else if (!selectedGame && !playing && current.gameRef) {
            if (key === 38) {
                var scheduleList = element('list');
                var topMatch = scheduleList.querySelector('.match-card');
                if (current === topMatch) {
                    element('refresh').focus();
                    return;
                }
            }
            buttons = Array.prototype.filter.call(element('list').querySelectorAll('.match-card'), function (button) { return button.offsetWidth > 0 && button.offsetHeight > 0; });
        } else if (selectedGame && current.classList && current.classList.contains('source')) {
            buttons = Array.prototype.filter.call(element('sourceList').querySelectorAll('.source'), function (button) { return button.offsetWidth > 0 && button.offsetHeight > 0; });
        }

        if (selectedGame && key === 37 && current.classList && current.classList.contains('source')) {
            var selectedLeagueButton = element('leagueButtons').querySelector('.league-button[data-league-key="' + selectedGame.leagueKey + '"]');
            if (selectedLeagueButton) { selectedLeagueButton.focus(); return; }
        }

        if (selectedGame && key === 39 && current.classList && current.classList.contains('league-button')) {
            var firstSource = element('sourceList').querySelector('.source');
            if (firstSource) { firstSource.focus(); return; }
        }

        if (!selectedGame && key === 39 && current.gameRef) {
            var currentSection = current.parentNode && current.parentNode.parentNode;
            var sameLeagueCards = currentSection && currentSection.querySelectorAll('.match-card');
            if (!sameLeagueCards || sameLeagueCards.length < 2) { return; }
            var currentBox = current.getBoundingClientRect();
            var rightCard = null;
            var rightScore = Infinity;
            Array.prototype.forEach.call(sameLeagueCards, function (candidateCard) {
                if (candidateCard === current) { return; }
                var candidateBox = candidateCard.getBoundingClientRect();
                var horizontalGap = candidateBox.left - currentBox.right;
                if (horizontalGap <= 2) { return; }
                var verticalGap = Math.abs((candidateBox.top + candidateBox.bottom - currentBox.top - currentBox.bottom) / 2);
                var score = horizontalGap + verticalGap * 3;
                if (score < rightScore) { rightScore = score; rightCard = candidateCard; }
            });
            if (rightCard) {
                rightCard.focus();
                lastMatchFocus = rightCard;
                return;
            }
            return;
        }

        if (key === 39 && current.classList && current.classList.contains('league-button')) {
            var selectedKey = current.getAttribute('data-league-key');
            var remembered = document.body.contains(lastMatchFocus) ? lastMatchFocus : null;
            if (remembered && selectedKey && remembered.parentNode.parentNode.getAttribute('data-league-key') !== selectedKey) {
                remembered = null;
            }
            if (!remembered && lastSelectedGame && (!selectedKey || String(lastSelectedGame.leagueKey) === String(selectedKey))) {
                var selectedSection = element('list').querySelector('.league-section[data-league-key="' + lastSelectedGame.leagueKey + '"]');
                remembered = selectedSection && Array.prototype.filter.call(selectedSection.querySelectorAll('.match-card'), function (card) { return card.gameRef === lastSelectedGame; })[0];
            }
            if (!remembered) {
                if (selectedKey) {
                    var matchingSection = element('list').querySelector('.league-section[data-league-key="' + selectedKey + '"]');
                    remembered = matchingSection && matchingSection.querySelector('.match-card');
                } else {
                    remembered = element('list').querySelector('.match-card');
                }
            }
            if (remembered) {
                remembered.focus();
                lastMatchFocus = remembered;
                element('list').scrollTop = Math.max(0, remembered.parentNode.parentNode.offsetTop - 8);
                return;
            }
            return;
        }
        var box = current.getBoundingClientRect();
        var best = null; var score = Infinity;
        buttons.forEach(function (button) {
            if (button === current) { return; }
            var candidate = button.getBoundingClientRect();
            var horizontal = (candidate.left + candidate.right - box.left - box.right) / 2;
            var vertical = (candidate.top + candidate.bottom - box.top - box.bottom) / 2;
            var main = key === 37 ? -horizontal : key === 39 ? horizontal : key === 38 ? -vertical : vertical;
            var cross = key === 37 || key === 39 ? Math.abs(vertical) : Math.abs(horizontal);
            if (main > 2 && main + cross * 3 < score) { score = main + cross * 3; best = button; }
        });
        if (best) {
            best.focus();
            if (best.gameRef) { lastMatchFocus = best; }
            if (best.parentNode.className === 'league-games') {
                var groupHeading = best.parentNode.parentNode.querySelector('h2');
                var firstCard = best.parentNode.querySelector('button');
                if (best.offsetTop === firstCard.offsetTop && groupHeading.getBoundingClientRect().top < element('list').getBoundingClientRect().top) {
                    element('list').scrollTop -= element('list').getBoundingClientRect().top - groupHeading.getBoundingClientRect().top + 8;
                }
            }
        }
    }
    element('refresh').onclick = load;
    element('filter').onclick = function () { sourcesOnly = !sourcesOnly; selectedGame = null; activeLeagueKey = null; element('list').scrollTop = 0; render(); status(games.length + ' матчей · Местное время телевизора (' + HockeyData.timezoneLabel() + ')'); focusFirst(); };
    element('help').onclick = function () { showModal('hockey.live · 0.1.56 beta', 'Стрелки — выбор матча и источника. OK — открыть. Назад — показать управление, ещё раз Назад — вернуться к источникам.\nРасписание загружается из подключённого источника данных. Время автоматически переведено из UTC в часовой пояс телевизора (' + HockeyData.timezoneLabel() + '). Если время неверное, проверьте дату, время и часовой пояс в настройках Samsung TV.\nУправление остаётся в панели приложения, чтобы кнопки Назад, звук и перезапуск работали на всех источниках.'); };
    element('dismiss').onclick = dismiss;
    element('exit').onclick = function () { if (window.tizen) { tizen.application.getCurrentApplication().exit(); } else { dismiss(); } };
    element('closePlayer').onclick = returnToSources;
    element('retryPlayer').onclick = function () { play(selectedSource); };
    element('togglePlayer').onclick = toggle;
    element('playerTouchGuard').onclick = function (event) {
        event.preventDefault();
        event.stopPropagation();
        showPlayerBar();
        element('closePlayer').focus();
    };
    // Tizen delivers the hardware Back key at the application level even
    // when focus is inside a cross-origin iframe. Use it as the escape hatch
    // from the provider player back to the app's source list.
    if (window.tizen) {
        document.addEventListener('tizenhwkey', function (event) {
            if (event.keyName === 'back') {
                try { event.preventDefault(); } catch (error) {}
                back();
            }
        });
    }
    document.addEventListener('keydown', function (event) {
        var key = event.keyCode;
        if (key === 10009 || key === 27 || key === 8) { event.preventDefault(); back(); return; }
        if (playing && !youtubePlayer) { showPlayerBar(); }
        if (key >= 37 && key <= 40) { event.preventDefault(); move(key); }
        if (key === 13 && document.activeElement.tagName === 'BUTTON') { event.preventDefault(); document.activeElement.click(); }
        if (playing && (key === 10252 || key === 415 || key === 19)) { event.preventDefault(); toggle(key); }
    });
    document.addEventListener('focusin', function (event) {
        if (event.target && event.target.gameRef) { lastMatchFocus = event.target; }
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden && playing) { stop(); } });
    window.addEventListener('unload', stop);
    if (window.tizen && tizen.tvinputdevice) {
        ['MediaPlayPause', 'MediaPlay', 'MediaPause'].forEach(function (key) { try { tizen.tvinputdevice.registerKey(key); } catch (error) {} });
    }
    function clock() { element('clock').textContent = new Date().toLocaleTimeString(); }
    clock(); setInterval(clock, 1000);
    element('refresh').focus(); load();
}());
