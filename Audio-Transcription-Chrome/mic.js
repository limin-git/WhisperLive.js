async function captureAudio() {
    stop_stream_on_close = true;
    return await navigator.mediaDevices.getUserMedia({ audio: true });
}
