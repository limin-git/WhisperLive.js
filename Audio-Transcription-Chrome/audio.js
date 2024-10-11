const audioElement = document.getElementById('audioElement');
const audioContext = new window.AudioContext();
const audioSource = audioContext.createMediaElementSource(audioElement);
const destinationNode = audioContext.createMediaStreamDestination();
audioSource.connect(destinationNode);

media_element = audioElement;

async function captureAudio() {
    stop_stream_on_close = false;
    return destinationNode.stream;
}
