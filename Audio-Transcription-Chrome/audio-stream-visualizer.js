class AudioStreamVisualizer {
    constructor({ canvas_element = null, gain_button = null, gain_value = 1, fft_size = 32768 }) {
        this.canvas_element = canvas_element;
        this.gain_button = gain_button;
        this.gain_value = gain_value;
        this.fft_size = fft_size;

        if (this.gain_button) {
            this.gain_value = gain_button.value;

            this.gain_button.addEventListener('input', (event) => {
                this.set_gain_value(this.gain_button.value);
            });
        }

        this.context = null;
        this.source = null;
        this.gain_node = null;
        this.analyser = null;
    }

    init() {
        if (this.context == null) {
            this.context = new AudioContext({ sampleRate: 16000 });
        }

        if (this.gain_node == null) {
            this.gain_node = this.context.createGain();
        }

        this.set_gain_value(this.gain_value);

        if (this.analyser == null) {
            this.analyser = this.context.createAnalyser();
            this.analyser.fftSize = this.fft_size;

            this.gain_node.connect(this.analyser);
            // this.gain_node.connect(this.context.destination);
        }
    }

    set_gain_value(gain_value) {
        this.gain_value = gain_value;

        if (this.gain_node) {
            this.gain_node.gain.setValueAtTime(this.gain_value, this.context.currentTime);
        }
    }

    start(stream) {
        this.init();

        this.source = this.context.createMediaStreamSource(stream);
        this.source.connect(this.gain_node);

        this.visualize_audio_stream();
    }

    stop() {
        if (this.source) {
            this.source.disconnect(this.gain_node);
            this.source = null;
        }

        this.canvas_element.style.display = 'none';
    }

    async visualize_audio_stream() {
        const analyser = this.analyser;
        const canvas = this.canvas_element;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        canvas.style.display = 'inline';
        const canvasCtx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = 200;

        const draw = () => {
            if (this.source == null) {
                return;
            }

            requestAnimationFrame(draw);

            analyser.getByteTimeDomainData(dataArray);

            canvasCtx.fillStyle = 'rgb(200, 200, 200)';
            canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

            // canvasCtx.lineWidth = 2;
            canvasCtx.lineWidth = 0.3;
            canvasCtx.strokeStyle = 'rgb(0, 0, 0)';

            canvasCtx.beginPath();

            const sliceWidth = (canvas.width * 1.0) / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = (v * canvas.height) / 2;

                if (i === 0) {
                    canvasCtx.moveTo(x, y);
                } else {
                    canvasCtx.lineTo(x, y);
                }

                x += sliceWidth;
            }

            canvasCtx.lineTo(canvas.width, canvas.height / 2);
            canvasCtx.stroke();
        };

        draw();
    }
}

export { AudioStreamVisualizer };
