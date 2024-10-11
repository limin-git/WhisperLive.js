// const host = 'localhost';
// const host = '127.0.0.1';
// const host = '192.168.10.198';
// const host = '192.168.10.233';
const host = '192.168.11.74';
const port = '9090';

var language = 'en'; // zh, Malay: ms, Tamil: ta
var task = 'transcribe'; // transcribe, translate

var media_element = null;

var socket = null;
var stream = null;
var isServerReady = false;
var all_segments = {};
var stop_stream_on_close = true;
var is_microphone = false;

async function stop_media() {
    media_element.pause();
    media_element.currentTime = 0;
}

async function play_media() {
    media_element.muted = false;
    media_element.play();
}

/**
 * Resamples the audio data to a target sample rate of 16kHz.
 * @param {Array|ArrayBuffer|TypedArray} audioData - The input audio data.
 * @param {number} [origSampleRate=44100] - The original sample rate of the audio data.
 * @returns {Float32Array} The resampled audio data at 16kHz.
 */
function resampleTo16kHZ(audioData, origSampleRate = 44100) {
    // Convert the audio data to a Float32Array
    const data = new Float32Array(audioData);

    // Calculate the desired length of the resampled data
    const targetLength = Math.round(data.length * (16000 / origSampleRate));

    // Create a new Float32Array for the resampled data
    const resampledData = new Float32Array(targetLength);

    // Calculate the spring factor and initialize the first and last values
    const springFactor = (data.length - 1) / (targetLength - 1);
    resampledData[0] = data[0];
    resampledData[targetLength - 1] = data[data.length - 1];

    // Resample the audio data
    for (let i = 1; i < targetLength - 1; i++) {
        const index = i * springFactor;
        const leftIndex = Math.floor(index).toFixed();
        const rightIndex = Math.ceil(index).toFixed();
        const fraction = index - leftIndex;
        resampledData[i] = data[leftIndex] + (data[rightIndex] - data[leftIndex]) * fraction;
    }

    // Return the resampled data
    return resampledData;
}

function generateUUID() {
    let dt = new Date().getTime();
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (dt + Math.random() * 16) % 16 | 0;
        dt = Math.floor(dt / 16);
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
    return uuid;
}

/**
 * Starts recording audio from the captured tab.
 * @param {Object} option - The options object containing the currentTabId.
 */
async function startRecord(option) {
    stream = await captureAudio();
    const uuid = generateUUID();
    console.log('options', option);

    if (stream) {
        // call when the stream inactive
        stream.oninactive = () => {
            // window.close();
            return;
        };

        socket = new WebSocket(`ws://${option.host}:${option.port}/`);
        let language = option.language;

        socket.onopen = function (e) {
            socket.send(
                JSON.stringify({
                    uid: uuid,
                    language: option.language,
                    task: option.task,
                    use_vad: option.useVad,
                })
            );
        };

        socket.onmessage = async (event) => {
            const data = JSON.parse(event.data);

            console.log(data);

            if (data['uid'] !== uuid) {
                console.error('uid not match');
                return;
            }

            if (data['status'] === 'WAIT') {
                await sendMessageToTab(option.currentTabId, {
                    type: 'showWaitPopup',
                    data: data['message'],
                });
                // chrome.runtime.sendMessage({ action: 'toggleCaptureButtons', data: false });
                // chrome.runtime.sendMessage({ action: 'stopCapture' });
                return;
            }

            if (isServerReady === false) {
                isServerReady = true;
                return;
            }

            if (language === null) {
                language = data['language'];

                // send message to popup.js to update dropdown
                // console.log(language);
                // chrome.runtime.sendMessage({
                //     action: 'updateSelectedLanguage',
                //     detectedLanguage: language,
                // });

                return;
            }

            if (data['message'] === 'DISCONNECT') {
                // chrome.runtime.sendMessage({ action: 'toggleCaptureButtons', data: false });
                return;
            }

            if (data['message'] === 'SERVER_READY') {
                // chrome.runtime.sendMessage({ action: 'toggleCaptureButtons', data: false });
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

        const context = new AudioContext();
        const mediaStream = context.createMediaStreamSource(stream);

        // 256, 512, 1024, 2048, 4096, 8192, 16384
        // const recorder = context.createScriptProcessor(4096, 1, 1);
        const recorder = context.createScriptProcessor(16384, 1, 1);

        recorder.onaudioprocess = async (event) => {
            if (!context || !isServerReady) return;

            const inputData = event.inputBuffer.getChannelData(0);
            const audioData16kHz = resampleTo16kHZ(inputData, context.sampleRate);
            socket.send(audioData16kHz);
        };

        // Prevent page mute
        mediaStream.connect(recorder);
        recorder.connect(context.destination);

        if (is_microphone == false) {
            mediaStream.connect(context.destination);
        }
    } else {
        window.close();
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

    stop_media();

    isServerReady = false;

    if (socket) {
        socket.close();
        socket = null;
    }

    if (stop_stream_on_close && stream) {
        console.log('stop audio streaming');
        stream.getAudioTracks().forEach((track) => track.stop());
        stream = null;
    }

    document.getElementById('stop').disabled = true;
    document.getElementById('start').disabled = false;
    console.log('DONE');
}
