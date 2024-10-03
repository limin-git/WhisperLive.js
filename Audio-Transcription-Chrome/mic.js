async function captureAudio() {
    stop_stream_on_close = true;
    is_microphone = true;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log(stream);
    return stream;
}
