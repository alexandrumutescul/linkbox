const statusElement = document.querySelector('#asset-status');

if (statusElement) {
  statusElement.textContent = 'Frontend JavaScript loaded successfully.';
  statusElement.dataset.loaded = 'true';
}
