const videoElement = document.getElementById('videoElement');
const audioContext = new window.AudioContext();
const videoSource = audioContext.createMediaElementSource(videoElement);
const destinationNode = audioContext.createMediaStreamDestination();
videoSource.connect(destinationNode);

async function captureAudio() {
    stop_stream_on_close = false;
    return destinationNode.stream;
}
