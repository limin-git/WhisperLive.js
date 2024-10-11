class DataConversionAudioProcessor_WhisperLive extends AudioWorkletProcessor {
    constructor(options) {
        super(options);
    }

    process(inputs) {
        const input = inputs[0];
        if (!input || input.length === 0) {
            return;
        }

        const samples = input[0];
        const output = new Float32Array(samples);
        this.port.postMessage(output);

        return true;
    }
}

registerProcessor('data-conversion-processor', DataConversionAudioProcessor_WhisperLive);
