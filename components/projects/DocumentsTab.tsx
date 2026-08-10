"use client";

import { useState } from "react";
import { Folder, Upload, File, Trash2, Download, ExternalLink } from "lucide-react";
import Loader from "@/components/ui/Loader";
import { useProjectDocuments, useDeleteDocument } from "@/lib/hooks/useProjectDocuments";
import UploadDocumentModal from "@/components/modals/UploadDocumentModal";

export default function DocumentsTab({ projectId }: { projectId: string }) {
  const { data: documents = [], isLoading } = useProjectDocuments(projectId);
  const deleteDoc = useDeleteDocument();
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (isLoading) {
    return <div className="p-8 flex justify-center"><Loader text="Loading documents..." /></div>;
  }

  const formatSize = (bytes?: number) => {
    if (!bytes) return "—";
    if (bytes < 1024) return bytes + " B";
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    else return (bytes / 1048576).toFixed(1) + " MB";
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  return (
    <div className="p-6">
      <section className="dash-widget dash-widget--projects card">
        <div className="dash-widget-head dash-widget-head--split">
          <div>
            <h3 className="dash-widget-title flex items-center gap-2"><Folder size={18} className="text-slate-500" /> Project Documents</h3>
            <p className="dash-widget-sub">Manage contracts, drawings, and other files.</p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="btn btn-primary btn-sm flex items-center gap-2 cursor-pointer"
          >
            <Upload size={16} /> Upload File
          </button>
        </div>

        <div className="table-wrap projects-table-wrap">
          <table className="dash-table projects-table w-full text-left whitespace-nowrap">
            <thead>
              <tr>
                <th className="px-5 py-4 w-10"></th>
                <th className="px-5 py-4">Name</th>
                <th className="px-5 py-4">Type</th>
                <th className="px-5 py-4">Size</th>
                <th className="px-5 py-4">Uploaded Date</th>
                <th className="px-5 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <Folder size={48} className="mb-4 text-slate-300" />
                      <p className="text-base font-medium text-slate-600">No documents found</p>
                      <p className="text-sm mt-1">Upload a document to get started.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                documents.map(doc => (
                  <tr key={doc.id} className="hover:bg-slate-50/50 group transition-colors">
                    <td className="px-5 py-4 text-slate-400">
                      <File size={18} />
                    </td>
                    <td className="px-5 py-4 font-medium text-slate-900">{doc.name}</td>
                    <td className="px-5 py-4 text-slate-500 uppercase text-xs font-semibold">{doc.type || "FILE"}</td>
                    <td className="px-5 py-4 text-slate-500">{formatSize(doc.size)}</td>
                    <td className="px-5 py-4 text-slate-500">{formatDate(doc.createdAt)}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-start gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a 
                          href={doc.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-indigo-600 transition-colors"
                          title="View"
                        >
                          <ExternalLink size={16} />
                        </a>
                        <a 
                          href={doc.url} 
                          download
                          className="text-slate-400 hover:text-indigo-600 transition-colors"
                          title="Download"
                        >
                          <Download size={16} />
                        </a>
                        <button 
                          onClick={() => deleteDoc.mutate({ id: doc.id, projectId })}
                          className="text-slate-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <UploadDocumentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        projectId={projectId}
      />
    </div>
  );
}
