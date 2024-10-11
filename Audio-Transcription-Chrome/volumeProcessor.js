function getRMS(samples) {
    const sum = samples.reduce((acc, curr) => acc + curr * curr, 0);
    return Math.sqrt(sum / samples.length);
}

function rmsToDb(gain) {
    return 20 * Math.log10(gain);
}

function getVolumePercent(dbValue) {
    const minDb = -80;

    if (dbValue < minDb) {
        return 0;
    } else if (dbValue > 1) {
        return 1;
    }

    const volumePercent = (Math.abs(minDb) - Math.abs(dbValue)) / Math.abs(minDb);
    return volumePercent;
}

class VolumeProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);
    }

    process(inputs) {
        const input = inputs[0];
        if (!input || input.length === 0) {
            return;
        }

        const samples = input[0];
        const rms = getRMS(samples);
        const db = rmsToDb(rms);
        const volumePercent = getVolumePercent(db);
        this.port.postMessage({ volumePercent });

        return true;
    }
}

registerProcessor('volume-processor', VolumeProcessor);
