async function captureMicAudio() {
    stop_stream_on_close = true;
    return await navigator.mediaDevices.getUserMedia({ audio: true });
}
