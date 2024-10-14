class DataConversionAudioProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);
        this.buffer = [];
    }

    // 处理音频数据的方法，每次处理 128 个音频帧
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (input.length > 0) {
            const int16Array = this.convertFloat32ToInt16(input[0]);
            this.buffer.push(...int16Array);

            if (this.buffer.length > 4096) {
                this.port.postMessage(this.resampleTo16kHZ(this.buffer));
                this.buffer = [];
            }
        }
        return true;
    }

    convertFloat32ToInt16(buffer) {
        const l = buffer.length;
        const int16Array = new Int16Array(l);
        for (let i = 0; i < l; i++) {
            int16Array[i] = Math.min(1, buffer[i]) * 0x7fff;
        }
        return int16Array;
    }

    /**
     * Resamples the audio data to a target sample rate of 16kHz.
     * @param {Array|ArrayBuffer|TypedArray} audioData - The input audio data.
     * @param {number} [origSampleRate=44100] - The original sample rate of the audio data.
     * @returns {Float32Array} The resampled audio data at 16kHz.
     */
    resampleTo16kHZ(audioData, origSampleRate = 48000) {
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
}

registerProcessor('data-conversion-processor', DataConversionAudioProcessor);
