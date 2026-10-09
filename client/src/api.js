import { SERVER_URL } from './config';

export async function apiRequest(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${SERVER_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.message || 'Something went wrong');
  }
  return data;
}

// Upload a file to a meeting, reporting progress from 0 to 100
export function uploadMeetingFile(code, file, token, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SERVER_URL}/api/meetings/${code}/files`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = {};
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new Error(data.message || 'Upload failed'));
      }
    };

    xhr.onerror = () => reject(new Error('Could not reach the server'));

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}

// Download a file from a meeting and save it with its original name
export async function downloadMeetingFile(code, file, token) {
  const response = await fetch(
    `${SERVER_URL}/api/meetings/${code}/files/${file.id}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!response.ok) {
    let message = 'Could not download the file';
    try {
      const data = await response.json();
      if (data.message) message = data.message;
    } catch {
      // keep the default message
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}