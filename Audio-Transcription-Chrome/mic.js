/**
 * Removes a tab with the specified tab ID in Google Chrome.
 * @param {number} tabId - The ID of the tab to be removed.
 * @returns {Promise<void>} A promise that resolves when the tab is successfully removed or fails to remove.
 */
function removeChromeTab(tabId) {
    return new Promise((resolve) => {
        chrome.tabs.remove(tabId).then(resolve).catch(resolve);
    });
}

/**
 * Executes a script file in a specific tab in Google Chrome.
 * @param {number} tabId - The ID of the tab where the script should be executed.
 * @param {string} file - The file path or URL of the script to be executed.
 * @returns {Promise<void>} A promise that resolves when the script is successfully executed or fails to execute.
 */
function executeScriptInTab(tabId, file) {
    return new Promise((resolve) => {
        chrome.scripting.executeScript(
            {
                target: { tabId },
                files: [file],
            },
            () => {
                resolve();
            }
        );
    });
}

/**
 * Opens the options page of the Chrome extension in a new pinned tab.
 * @returns {Promise<chrome.tabs.Tab>} A promise that resolves with the created tab object.
 */
function openExtensionOptions() {
    return new Promise((resolve) => {
        chrome.tabs.create(
            {
                pinned: true,
                active: false,
                url: `chrome-extension://${chrome.runtime.id}/options.html`,
            },
            (tab) => {
                resolve(tab);
            }
        );
    });
}

/**
 * Retrieves the value associated with the specified key from the local storage in Google Chrome.
 * @param {string} key - The key of the value to retrieve from the local storage.
 * @returns {Promise<any>} A promise that resolves with the retrieved value from the local storage.
 */
function getLocalStorageValue(key) {
    return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
            resolve(result[key]);
        });
    });
}

/**
 * Sends a message to a specific tab in Google Chrome.
 * @param {number} tabId - The ID of the tab to send the message to.
 * @param {any} data - The data to be sent as the message.
 * @returns {Promise<any>} A promise that resolves with the response from the tab.
 */
function sendMessageToTab(tabId, data) {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, data, (response) => {
            resolve(response);
        });
    });
}

/**
 * Delays the execution for a specified duration.
 * @param {number} ms - The duration to sleep in milliseconds (default: 0).
 * @returns {Promise<void>} A promise that resolves after the specified duration.
 */
function delayExecution(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sets a value associated with the specified key in the local storage of Google Chrome.
 * @param {string} key - The key to set in the local storage.
 * @param {any} value - The value to associate with the key in the local storage.
 * @returns {Promise<any>} A promise that resolves with the value that was set in the local storage.
 */
function setLocalStorageValue(key, value) {
    return new Promise((resolve) => {
        chrome.storage.local.set(
            {
                [key]: value,
            },
            () => {
                resolve(value);
            }
        );
    });
}

/**
 * Retrieves the tab object with the specified tabId.
 * @param {number} tabId - The ID of the tab to retrieve.
 * @returns {Promise<object>} - A Promise that resolves to the tab object.
 */
async function getTab(tabId) {
    return new Promise((resolve) => {
        chrome.tabs.get(tabId, (tab) => {
            resolve(tab);
        });
    });
}

/**
 * Starts the capture process for the specified tab.
 * @param {number} tabId - The ID of the tab to start capturing.
 * @returns {Promise<void>} - A Promise that resolves when the capture process is started successfully.
 */
async function startCapture(options) {
    const { tabId } = options;
    const optionTabId = await getLocalStorageValue('optionTabId');
    if (optionTabId) {
        await removeChromeTab(optionTabId);
    }

    try {
        const currentTab = await getTab(tabId);
        if (currentTab.audible) {
            await setLocalStorageValue('currentTabId', currentTab.id);
            await executeScriptInTab(currentTab.id, 'content.js');
            await delayExecution(500);

            const optionTab = await openExtensionOptions();

            await setLocalStorageValue('optionTabId', optionTab.id);
            await delayExecution(500);

            await sendMessageToTab(optionTab.id, {
                type: 'start_capture',
                data: {
                    currentTabId: currentTab.id,
                    host: options.host,
                    port: options.port,
                    multilingual: options.useMultilingual,
                    language: options.language,
                    task: options.task,
                    modelSize: options.modelSize,
                    useVad: options.useVad,
                },
            });
        } else {
            console.log('No Audio');
        }
    } catch (error) {
        console.error('Error occurred while starting capture:', error);
    }
}

/**
 * Stops the capture process and performs cleanup.
 * @returns {Promise<void>} - A Promise that resolves when the capture process is stopped successfully.
 */
async function stopCapture() {
    const optionTabId = await getLocalStorageValue('optionTabId');
    const currentTabId = await getLocalStorageValue('currentTabId');

    if (optionTabId) {
        res = await sendMessageToTab(currentTabId, {
            type: 'STOP',
            data: { currentTabId: currentTabId },
        });
        await removeChromeTab(optionTabId);
    }
}

/**
 * Captures audio from the active tab in Google Chrome.
 * @returns {Promise<MediaStream>} A promise that resolves with the captured audio stream.
 */
async function captureTabAudio() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return stream;
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

var socket = null;
var stream = null;
var isServerReady = false;
var all_text_dict = {};

/**
 * Starts recording audio from the captured tab.
 * @param {Object} option - The options object containing the currentTabId.
 */
async function startRecord(option) {
    stream = await captureTabAudio();
    const uuid = generateUUID();
    console.log(uuid);
    console.log(option);

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
                    model: option.modelSize,
                    use_vad: option.useVad,
                })
            );
        };

        socket.onmessage = async (event) => {
            const data = JSON.parse(event.data);

            console.log(data);

            if (data['uid'] !== uuid) {
                console.log('uid not match');
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
                chrome.runtime.sendMessage({
                    action: 'updateSelectedLanguage',
                    detectedLanguage: language,
                });

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

            // console.log();

            // let message = JSON.parse(event.data);
            const message = data['segments'];

            message.forEach((msg) => {
                console.log(Number(msg.start), msg.text);
                all_text_dict[Number(msg.start)] = msg.text.trim();
            });

            let arr = Object.entries(all_text_dict);
            arr = arr.sort((a, b) => a[0] - b[0]);

            let text = '';
            arr.forEach((x) => {
                text += x[1] + '\n';
            });

            console.log(arr);

            document.getElementById('text').value = text;
        };

        const audioDataCache = [];
        const context = new AudioContext();
        const mediaStream = context.createMediaStreamSource(stream);
        const recorder = context.createScriptProcessor(4096, 1, 1);

        recorder.onaudioprocess = async (event) => {
            if (!context || !isServerReady) return;

            const inputData = event.inputBuffer.getChannelData(0);
            const audioData16kHz = resampleTo16kHZ(inputData, context.sampleRate);

            audioDataCache.push(inputData);

            socket.send(audioData16kHz);
        };

        // Prevent page mute
        mediaStream.connect(recorder);
        recorder.connect(context.destination);
        mediaStream.connect(context.destination);
        // }
    } else {
        window.close();
    }
}

document.getElementById('start').disabled = false;
document.getElementById('stop').disabled = true;

function start_record() {
    console.log('start recording');

    all_text_dict = {};
    document.getElementById('text').value = '';

    startRecord({
        host: 'localhost',
        port: '9090',
        language: 'zh',
        task: 'transcribe',
        model: 'small',
        useVAad: false,
    });

    document.getElementById('start').disabled = true;
    document.getElementById('stop').disabled = false;
    console.log('READY');
}

function stop_record() {
    console.log('stop recording');

    isServerReady = false;

    if (socket) {
        socket.close();
        socket = null;
    }

    if (stream) {
        console.log('stop audio');
        stream.getAudioTracks().forEach((track) => track.stop());
        stream = null;
    }

    document.getElementById('stop').disabled = true;
    document.getElementById('start').disabled = false;
    console.log('DONE');
}
