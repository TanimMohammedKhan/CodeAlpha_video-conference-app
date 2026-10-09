import { useRef, useState } from 'react';
import { Download, File, Upload, X } from 'lucide-react';
import '../files.css';

const MAX_SIZE = 25 * 1024 * 1024;

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function FilePanel({ files, onUpload, onDownload, onClose }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const uploadAll = async (fileList) => {
    const selected = Array.from(fileList);
    setError('');

    for (const file of selected) {
      if (file.size === 0) {
        setError(`"${file.name}" is empty.`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        setError(`"${file.name}" is larger than 25 MB.`);
        continue;
      }

      try {
        setUploading({ name: file.name, progress: 0 });
        await onUpload(file, (progress) => {
          setUploading({ name: file.name, progress });
        });
      } catch (err) {
        setError(err.message);
      }
    }

    setUploading(null);
  };

  const handleChoose = (e) => {
    if (e.target.files && e.target.files.length > 0 && !uploading) {
      uploadAll(e.target.files);
    }
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (!uploading && e.dataTransfer.files.length > 0) {
      uploadAll(e.dataTransfer.files);
    }
  };

  const handleDownload = async (file) => {
    setError('');
    setDownloadingId(file.id);
    try {
      await onDownload(file);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingId(null);
    }
  };

  const newestFirst = [...files].reverse();

  return (
    <aside className="chat-panel">
      <div className="chat-header">
        <span>Shared files</span>
        <button
          type="button"
          className="chat-close"
          onClick={onClose}
          aria-label="Close files"
        >
          <X size={18} />
        </button>
      </div>

      <div className="files-body">
        <div
          className={`dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          {uploading ? (
            <div className="upload-progress">
              <span className="upload-name">Uploading {uploading.name}</span>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${uploading.progress}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <Upload size={22} />
              <span>Drag files here to share them</span>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => inputRef.current && inputRef.current.click()}
              >
                Choose files
              </button>
              <span>Up to 25 MB each</span>
            </>
          )}

          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={handleChoose}
          />
        </div>

        {error && <div className="files-error">{error}</div>}

        <ul className="file-list">
          {newestFirst.length === 0 && (
            <li className="file-empty">No files shared yet.</li>
          )}

          {newestFirst.map((file) => (
            <li key={file.id} className="file-item">
              <div className="file-icon">
                <File size={20} />
              </div>
              <div className="file-info">
                <div className="file-name" title={file.name}>
                  {file.name}
                </div>
                <div className="file-meta">
                  {formatSize(file.size)} · {file.uploaderName} ·{' '}
                  {formatTime(file.createdAt)}
                </div>
              </div>
              <button
                type="button"
                className="file-download"
                onClick={() => handleDownload(file)}
                disabled={downloadingId === file.id}
                aria-label={`Download ${file.name}`}
                title="Download"
              >
                <Download size={18} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

export default FilePanel;