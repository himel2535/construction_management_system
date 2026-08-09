"use client";

import { useState } from "react";
import { X, UploadCloud } from "lucide-react";
import { useUploadDocument } from "@/lib/hooks/useProjectDocuments";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export default function UploadDocumentModal({ isOpen, onClose, projectId }: Props) {
  const uploadDoc = useUploadDocument();

  const [formData, setFormData] = useState({
    name: "",
    type: "DOCUMENT",
    url: "",
  });

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.url) return;

    await uploadDoc.mutateAsync({
      projectId,
      name: formData.name,
      type: formData.type,
      url: formData.url,
      size: Math.floor(Math.random() * 5000000) + 100000, // Dummy size for now
      uploadedBy: "Current User",
    });
    
    setFormData({ name: "", type: "DOCUMENT", url: "" });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Upload Document</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto">
          <form id="docForm" onSubmit={handleSubmit} className="space-y-4">
            
            <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center text-center hover:bg-slate-50 transition-colors cursor-pointer">
               <UploadCloud className="text-slate-400 mb-2" size={32} />
               <p className="text-sm font-medium text-slate-700">Click to browse or drag file here</p>
               <p className="text-xs text-slate-500 mt-1">PDF, JPG, PNG, DOCX up to 10MB</p>
               {/* Actual file upload is mocked for now via URL input */}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Document Name *</label>
              <input 
                required
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                placeholder="e.g. Ground Floor Plan"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">File URL *</label>
              <input 
                required
                type="url"
                name="url"
                value={formData.url}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                placeholder="https://example.com/file.pdf"
              />
              <p className="text-xs text-slate-500 mt-1">Since we do not have a real file upload bucket yet, please provide a valid URL.</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Document Type</label>
              <select 
                name="type"
                value={formData.type}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="DOCUMENT">Document</option>
                <option value="DRAWING">Drawing</option>
                <option value="CONTRACT">Contract</option>
                <option value="INVOICE">Invoice</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </form>
        </div>
        
        <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 mt-auto">
          <button 
            type="button" 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition-colors"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            form="docForm"
            disabled={uploadDoc.isPending}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {uploadDoc.isPending ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
