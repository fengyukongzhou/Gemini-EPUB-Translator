import React, { useState, DragEvent, ChangeEvent } from 'react';
import { Upload, FileUp } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  disabled: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Prevent flickering when dragging over child elements
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      // Basic validation for EPUB extension
      if (file.name.toLowerCase().endsWith('.epub')) {
        onFileSelect(file);
      } else {
        alert("Please upload a valid .epub file");
      }
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`border-2 border-dashed rounded-xl transition-all duration-200 group
        ${disabled 
          ? 'opacity-50 cursor-not-allowed border-slate-300 bg-slate-50' 
          : isDragging 
            ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-100' 
            : 'border-slate-300 hover:border-blue-500 hover:bg-blue-50 bg-white'
        }`}
    >
      <input
        type="file"
        accept=".epub"
        onChange={handleFileChange}
        disabled={disabled}
        className="hidden"
        id="epub-upload"
      />
      <label 
        htmlFor="epub-upload" 
        className={`flex flex-row items-center w-full p-4 gap-4 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <div className={`p-3 rounded-full shrink-0 transition-colors duration-200 ${isDragging ? 'bg-blue-200' : 'bg-blue-100 group-hover:bg-blue-200'}`}>
          {isDragging ? (
            <FileUp className={`w-6 h-6 ${isDragging ? 'text-blue-700' : 'text-blue-600'}`} />
          ) : (
            <Upload className="w-6 h-6 text-blue-600" />
          )}
        </div>
        
        <div className="flex flex-col items-start text-left">
          <h3 className={`text-sm font-semibold transition-colors ${isDragging ? 'text-blue-700' : 'text-slate-700'}`}>
            {isDragging ? "Drop EPUB file here" : "Select or Drop EPUB File"}
          </h3>
          <p className={`text-xs mt-0.5 transition-colors ${isDragging ? 'text-blue-600' : 'text-slate-500'}`}>
            {isDragging ? "Release to start" : "Click to browse"}
          </p>
        </div>
      </label>
    </div>
  );
};

export default FileUpload;