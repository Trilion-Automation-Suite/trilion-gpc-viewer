import { useRef, useState, DragEvent, ChangeEvent, KeyboardEvent } from 'react'
import './FilePicker.css'

interface FilePickerProps {
  onFile: (file: File) => void
}

export function FilePicker({ onFile }: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function openPicker() {
    inputRef.current?.click()
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    // Reset so re-picking same file fires change event
    e.target.value = ''
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openPicker()
    }
  }

  return (
    <div className="file-picker-wrapper">
      <div
        className={`file-picker-zone${dragOver ? ' drag-over' : ''}`}
        onClick={openPicker}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label="Open file picker for .gconfiguration file"
      >
        {/* Document + down-arrow icon */}
        <svg
          className="file-picker-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="12" x2="12" y2="18" />
          <polyline points="9 15 12 18 15 15" />
        </svg>

        <p className="file-picker-primary">Drop a .gconfiguration file here</p>
        <p className="file-picker-secondary">or tap to browse</p>
        <p className="file-picker-hint">Accepts .gconfiguration files</p>
      </div>

      <input
        ref={inputRef}
        className="file-picker-input"
        type="file"
        accept=".gconfiguration"
        onChange={handleChange}
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  )
}
