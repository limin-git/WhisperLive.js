// const host = 'localhost';
const host = '127.0.0.1';
// const host = '192.168.10.198';
// const host = '192.168.10.233';
// const host = '192.168.11.74';
const port = '9090';

var language = 'en'; // zh, Malay: ms, Tamil: ta
var task = 'transcribe'; // transcribe, translate

var media_element = null;
var media_source = null;

var socket = null;
var source = null;
var gain = null;
var processor = null;
var isServerReady = false;
var all_segments = {};
var stop_stream_on_close = true;
var is_microphone = false;

const context = new window.AudioContext({ sampleRate: 16000 });

function generateUUID() {
    let dt = new Date().getTime();
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (dt + Math.random() * 16) % 16 | 0;
        dt = Math.floor(dt / 16);
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
    return uuid;
}

async function getAudioSource() {
    media_element = document.getElementById('audioElement');

    if (media_element) {
        stop_stream_on_close = false;

        if (media_source == null) {
            media_source = context.createMediaElementSource(media_element);
        }

        return media_source;
    }

    is_microphone = true;

    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            channelCount: 1,
            sampleRate: 16000,
        },
    });

    return context.createMediaStreamSource(stream);
}

/**
 * Starts recording audio from the captured tab.
 * @param {Object} option - The options object containing the currentTabId.
 */
async function startRecord(option) {
    source = await getAudioSource();

    if (!source) {
        window.close();
        return;
    }

    console.log('options', option);
    console.log(source);

    // call when the stream inactive
    source.oninactive = () => {
        window.close();
        return;
    };

    socket = new WebSocket(`ws://${option.host}:${option.port}/`);
    let language = option.language;

    socket.onopen = function (e) {
        socket.send(
            JSON.stringify({
                uid: generateUUID(),
                language: option.language,
                task: option.task,
                use_vad: option.useVad,
            })
        );
    };

    socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        console.log(data);

        if (data['status'] === 'WAIT') {
            await sendMessageToTab(option.currentTabId, {
                type: 'showWaitPopup',
                data: data['message'],
            });
            return;
        }

        if (isServerReady === false) {
            isServerReady = true;
            return;
        }

        if (language === null) {
            language = data['language'];
            return;
        }

        if (data['message'] === 'DISCONNECT') {
            return;
        }

        if (data['message'] === 'SERVER_READY') {
            return;
        }

        const segments = data['segments'];
        console.log(segments);

        {
            const start = Number(segments[0].start);
            const entries = Object.entries(all_segments).filter((x) => Number(x[0]) < start);
            all_segments = Object.fromEntries(entries);
        }

        segments.forEach((seg) => {
            all_segments[seg.start] = seg.text.trim();
        });

        const entries = Object.entries(all_segments);
        entries.sort((a, b) => Number(a[0]) - Number(b[0]));

        const text = entries.map((x) => x[1]).join('\n');
        console.log(entries);

        const textarea = document.getElementById('text');
        textarea.value = text + '\n';
        textarea.scrollTop = textarea.scrollHeight;
    };

    await context.audioWorklet.addModule('data-conversion-processor.js');

    processor = new AudioWorkletNode(context, 'data-conversion-processor', {
        channelCount: 1,
        numberOfInputs: 1,
        numberOfOutputs: 1,
    });

    processor.port.onmessage = (event) => {
        if (!context || !isServerReady || !socket || socket.readyState != WebSocket.OPEN) {
            return;
        }

        socket.send(event.data);
    };

    processor.port.start();

    gain = context.createGain();
    gain.gain.value = 10;

    source.connect(gain);
    gain.connect(processor);

    if (!is_microphone) {
        source.connect(context.destination);
    }
}

document.getElementById('start').disabled = false;
document.getElementById('stop').disabled = true;

async function start_record() {
    console.log('start recording');

    all_segments = {};
    document.getElementById('text').value = '';

    startRecord({
        host: host,
        port: port,
        language: language,
        task: task,
        useVAad: false,
    });

    document.getElementById('start').disabled = true;
    document.getElementById('stop').disabled = false;
    console.log('READY');
}

async function stop_record() {
    console.log('stop recording');

    isServerReady = false;

    if (socket) {
        socket.close();
        socket = null;
    }

    if (is_microphone && source) {
        console.log('release microphone');
        source.mediaStream.getAudioTracks().forEach((track) => track.stop());
    }

    source.disconnect(gain);
    gain.disconnect(processor);

    if (!is_microphone) {
        source.disconnect(context.destination);
    }

    source = null;
    gain = null;
    processor = null;

    document.getElementById('stop').disabled = true;
    document.getElementById('start').disabled = false;
    console.log('DONE');
}
