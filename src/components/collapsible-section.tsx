'use client'

import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface CollapsibleSectionProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  icon?: React.ReactNode
  badge?: React.ReactNode
  defaultOpen?: boolean
  isOpen?: boolean
  onToggle?: (open: boolean) => void
  children: React.ReactNode
  className?: string
  headerRight?: React.ReactNode
  headerClassName?: string
  contentClassName?: string
}

export function CollapsibleSection({
  title,
  subtitle,
  icon,
  badge,
  defaultOpen = false,
  isOpen: controlledIsOpen,
  onToggle,
  children,
  className = "bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden",
  headerRight,
  headerClassName = "p-6 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 transition-colors select-none",
  contentClassName = "border-t border-gray-100"
}: CollapsibleSectionProps) {
  const [localIsOpen, setLocalIsOpen] = useState(defaultOpen)
  const isControlled = controlledIsOpen !== undefined
  const isOpen = isControlled ? controlledIsOpen : localIsOpen

  const handleToggle = (e: React.MouseEvent) => {
    // Prevent toggle if clicking on interactive elements like buttons, links, inputs, selects
    const target = e.target as HTMLElement
    if (
      target.closest('button') || 
      target.closest('a') || 
      target.closest('input') || 
      target.closest('select') || 
      target.closest('label') ||
      target.closest('[role="button"]')
    ) {
      return
    }
    
    const nextOpen = !isOpen
    if (!isControlled) {
      setLocalIsOpen(nextOpen)
    }
    if (onToggle) {
      onToggle(nextOpen)
    }
  }

  return (
    <section className={className}>
      <div 
        onClick={handleToggle}
        className={headerClassName}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {icon && <div className="shrink-0 flex items-center">{icon}</div>}
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900 leading-snug">{title}</h3>
            {subtitle && <p className="text-sm text-gray-500 mt-1 leading-normal">{subtitle}</p>}
          </div>
        </div>
        
        <div className="flex items-center gap-4 ml-4 shrink-0">
          {badge}
          {headerRight}
          <div className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
            <ChevronDown 
              className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
            />
          </div>
        </div>
      </div>
      
      {isOpen && (
        <div className={contentClassName}>
          {children}
        </div>
      )}
    </section>
  )
}
