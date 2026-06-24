'use client'

import { useSidebar } from './sidebar-context'
import { Menu, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { ReactNode } from 'react'

export function SidebarWrapper({ children }: { children: ReactNode }) {
  const { isCollapsed, setIsCollapsed, isMobileOpen, setIsMobileOpen } = useSidebar()

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`
          group/sidebar
          fixed md:relative z-50 h-full bg-[#0F172A] text-slate-300 flex flex-col flex-shrink-0 
          border-r border-slate-800/50 shadow-xl transition-all duration-300 ease-in-out
          ${isCollapsed ? 'md:w-[84px] collapsed' : 'md:w-64'} 
          w-64 
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* Collapse Toggle Button (Desktop only) */}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:flex absolute -right-3 top-8 bg-cyan-500 text-white rounded-full p-1.5 shadow-lg hover:bg-cyan-400 transition-colors z-50 items-center justify-center border-2 border-[#0F172A]"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {/* Mobile Close Button */}
        <button
          onClick={() => setIsMobileOpen(false)}
          className="md:hidden absolute right-4 top-6 text-slate-400 hover:text-white"
        >
          <X size={24} />
        </button>

        <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden no-scrollbar">
          {children}
        </div>
      </aside>
    </>
  )
}

export function MobileHeader({ children }: { children?: ReactNode }) {
  const { setIsMobileOpen } = useSidebar()
  return (
    <header className="md:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200 shrink-0">
      <div className="flex items-center gap-3">
        <button 
          onClick={() => setIsMobileOpen(true)}
          className="text-slate-500 hover:text-slate-700 p-1"
        >
          <Menu size={24} />
        </button>
        {children}
      </div>
    </header>
  )
}
