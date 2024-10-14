// const default_url = 'ws://127.0.0.1:9090';
// const default_url = 'ws://192.168.10.198:9090';
// const default_url = 'ws://192.168.10.233:9090';
const default_url = 'ws://192.168.11.74:9090';

const default_language = 'zh'; // zh, Malay: ms, Tamil: ta
const default_task = 'transcribe'; // transcribe, translate
const default_sample_rate = 48000;

class WhisperLiveClient {
    constructor({ url = default_url, language = default_language, task = default_task, gain_value = 1, is_microphone = false, start_button = null, stop_button = null, text_element = null, audio_element = null, sample_rate = default_sample_rate }) {
        this.url = url;
        this.language = language;
        this.task = task;
        this.is_microphone = is_microphone;
        this.sample_rate = sample_rate;
        this.audio_element = audio_element;
        this.gain_value = gain_value;
        this.text_element = text_element;
        this.start_button = start_button;
        this.stop_button = stop_button;

        this.server_ready = false;
        this.context = null;
        this.segments = [];
        this.source = null;
        this.ws = null;
        this.processor_node = null;
        this.gain_node = null;

        if (this.start_button && this.stop_button) {
            this.start_button.addEventListener('click', () => {
                this.start();
            });

            this.stop_button.addEventListener('click', () => {
                this.stop();
            });
        }

        this.set_start_stop_buttons({ disable_stop: true });
    }

    async start() {
        console.log('start speech-to-text with whisper-live: %s', this.url);

        await this.init();

        this.processor_node.port.start();

        if (this.gain_value != 1) {
            this.set_gain_value(this.gain_value);
        }

        console.log('READY');
    }

    stop() {
        console.log('stop speech-to-text from whisper-live: %s', this.url);

        this.set_start_stop_buttons({ disable_stop: true });

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.server_ready = false;

        if (this.gain_node && this.processor_node) {
            this.source.disconnect(this.gain_node);
            this.gain_node.disconnect(this.processor_node);
            this.processor_node.port.close();
            this.gain_node = null;
            this.processor_node = null;
        }

        if (this.is_microphone && this.source) {
            console.log('release microphone');
            this.source.mediaStream.getAudioTracks().forEach((track) => track.stop());
            this.source = null;
        }

        console.log('DONE');
    }

    async init() {
        if (this.context == null) {
            this.context = new window.AudioContext({ sampleRate: this.sample_rate });
            await this.context.audioWorklet.addModule('data-conversion-processor.js');
        }

        if (this.source == null) {
            if (this.audio_element) {
                this.source = this.context.createMediaElementSource(this.audio_element);
            } else if (this.is_microphone) {
                this.source = await this.get_microphone_source();
            }
        }

        if (this.ws == null) {
            this.ws = this.init_websocket();
        }

        if (this.processor_node == null) {
            this.init_audio();
        }

        this.segments = [];

        if (this.text_element) {
            this.text_element.value = '';
        }

        this.set_start_stop_buttons({ disable_start: true });
    }

    set_gain_value(gain_value) {
        this.gain_value = gain_value;

        if (this.gain_node && this.context) {
            console.log('set gain value to %d', gain_value);
            this.gain_node.gain.setValueAtTime(gain_value, this.context.currentTime);
        }
    }

    async get_microphone_source() {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                channelCount: 1,
                sampleRate: 16000,
            },
        });

        return this.context.createMediaStreamSource(stream);
    }

    generate_uuid() {
        let dt = new Date().getTime();
        const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = (dt + Math.random() * 16) % 16 | 0;
            dt = Math.floor(dt / 16);
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
        return uuid;
    }

    init_websocket() {
        const ws = new WebSocket(this.url);

        ws.onopen = () => {
            ws.send(
                JSON.stringify({
                    uid: this.generate_uuid(),
                    language: this.language,
                    task: this.task,
                    use_vad: false,
                })
            );
        };

        ws.onmessage = async (event) => {
            const data = JSON.parse(event.data);

            console.log(data);

            if (data['status'] === 'WAIT') {
                return;
            }

            if (this.server_ready === false) {
                this.server_ready = true;
                return;
            }

            if (this.language === null) {
                this.language = data['language'];
                return;
            }

            if (data['message'] === 'DISCONNECT') {
                return;
            }

            if (data['message'] === 'SERVER_READY') {
                return;
            }

            const segments = data['segments'];

            {
                const start = Number(segments[0].start);
                const entries = Object.entries(this.segments).filter((x) => Number(x[0]) < start);
                this.segments = Object.fromEntries(entries);
            }

            segments.forEach((seg) => {
                this.segments[seg.start] = seg.text.trim();
            });

            const entries = Object.entries(this.segments);
            entries.sort((a, b) => Number(a[0]) - Number(b[0]));

            const text = entries.map((x) => x[1]).join('\n');

            if (this.text_element) {
                this.text_element.value = text + '\n';
                this.text_element.scrollTop = this.text_element.scrollHeight;
            }
        };

        return ws;
    }

    async init_audio() {
        const processor_node = new AudioWorkletNode(this.context, 'data-conversion-processor', {
            channelCount: 1,
            numberOfInputs: 1,
            numberOfOutputs: 1,
            processorOptions: { sampleRate: this.sample_rate },
        });

        processor_node.port.onmessage = (event) => {
            if (!this.context || !this.server_ready || !this.ws || this.ws.readyState != WebSocket.OPEN) {
                return;
            }

            this.ws.send(event.data);
        };

        const gain_node = this.context.createGain();
        gain_node.gain.value = this.gain_value;

        this.source.connect(gain_node);
        gain_node.connect(processor_node);

        if (!this.is_microphone) {
            this.source.connect(this.context.destination);
        }

        this.processor_node = processor_node;
        this.gain_node = gain_node;
    }

    set_start_stop_buttons({ disable_start = false, disable_stop = false }) {
        if (this.start_button && this.stop_button) {
            this.start_button.style.display = disable_start ? 'none' : 'inline';
            this.stop_button.style.display = disable_stop ? 'none' : 'inline';
        }
    }
}

export { WhisperLiveClient };
