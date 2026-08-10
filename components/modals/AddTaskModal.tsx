"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useCreateTask, useProjectTeamAssignments } from "@/lib/hooks/useProjectTeam";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export default function AddTaskModal({ isOpen, onClose, projectId }: Props) {
  const createTask = useCreateTask();
  const { data: teamMembers = [] } = useProjectTeamAssignments(projectId);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    assigneeUserId: "",
    raci: "",
    priority: "medium",
    deadline: "",
    status: "todo",
  });

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) return;

    await createTask.mutateAsync({
      projectId,
      title: formData.title,
      description: formData.description || undefined,
      assigneeUserId: formData.assigneeUserId || undefined,
      raci: formData.raci || undefined,
      priority: formData.priority,
      deadline: formData.deadline || undefined,
      status: formData.status,
    });
    
    setFormData({ 
      title: "", 
      description: "", 
      assigneeUserId: "", 
      raci: "", 
      priority: "medium", 
      deadline: "", 
      status: "todo" 
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800">Add New Task</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto">
          <form id="taskForm" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Task Title *</label>
              <input 
                type="text"
                required
                name="title"
                value={formData.title}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Complete foundation design"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea 
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Brief description of the task..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Assign To</label>
              <select 
                name="assigneeUserId"
                value={formData.assigneeUserId}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">Unassigned</option>
                {teamMembers.map(tm => (
                  <option key={tm.id} value={tm.userId}>
                    {tm.user?.displayName || tm.user?.email || tm.userId}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                <select 
                  name="priority"
                  value={formData.priority}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select 
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">RACI Role</label>
                <select 
                  name="raci"
                  value={formData.raci}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">None</option>
                  <option value="R">Responsible</option>
                  <option value="A">Accountable</option>
                  <option value="C">Consulted</option>
                  <option value="I">Informed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Deadline</label>
                <input 
                  type="date"
                  name="deadline"
                  value={formData.deadline}
                  onChange={handleChange}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                />
              </div>
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
            form="taskForm"
            disabled={createTask.isPending}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {createTask.isPending ? "Adding..." : "Add Task"}
          </button>
        </div>
      </div>
    </div>
  );
}
