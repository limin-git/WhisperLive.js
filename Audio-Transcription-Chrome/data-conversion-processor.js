class DataConversionAudioProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length > 0) {
            this.port.postMessage(new Float32Array(input[0]));
        }
        return true;
    }
}

registerProcessor('data-conversion-processor', DataConversionAudioProcessor);
