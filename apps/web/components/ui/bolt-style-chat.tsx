'use client'

import React, { useEffect, useRef, useState } from 'react'
import {
  Bolt,
  Brain,
  Check,
  ChevronDown,
  FileCode,
  GitBranch,
  Image,
  Lightbulb,
  Paperclip,
  Plus,
  SendHorizontal,
  Sparkles,
  Zap,
} from 'lucide-react'

interface Model {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  badge?: string
}

function FigmaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox='0 0 24 24' fill='none'>
      <path d='M8 24C10.208 24 12 22.208 12 20V16H8C5.792 16 4 17.792 4 20C4 22.208 5.792 24 8 24Z' fill='currentColor' />
      <path d='M4 12C4 9.792 5.792 8 8 8H12V16H8C5.792 16 4 14.208 4 12Z' fill='currentColor' />
      <path d='M4 4C4 1.792 5.792 0 8 0H12V8H8C5.792 8 4 6.208 4 4Z' fill='currentColor' />
      <path d='M12 0H16C18.208 0 20 1.792 20 4C20 6.208 18.208 8 16 8H12V0Z' fill='currentColor' />
      <path d='M20 12C20 14.208 18.208 16 16 16C13.792 16 12 14.208 12 12C12 9.792 13.792 8 16 8C18.208 8 20 9.792 20 12Z' fill='currentColor' />
    </svg>
  )
}

const models: Model[] = [
  {
    id: 'sonnet-4.5',
    name: 'Sonnet 4.5',
    description: 'Fast and intelligent',
    icon: <Zap className='size-4 text-blue-400' />,
    badge: 'Default',
  },
  {
    id: 'opus-4.5',
    name: 'Opus 4.5',
    description: 'Most capable',
    icon: <Sparkles className='size-4 text-purple-400' />,
    badge: 'Pro',
  },
  {
    id: 'haiku-4.5',
    name: 'Haiku 4.5',
    description: 'Lightning fast',
    icon: <Brain className='size-4 text-emerald-400' />,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    description: 'OpenAI flagship',
    icon: <Sparkles className='size-4 text-green-400' />,
  },
  {
    id: 'gemini-2.0',
    name: 'Gemini 2.0',
    description: 'Google AI',
    icon: <Brain className='size-4 text-cyan-400' />,
  },
]

function ModelSelector({
  selectedModel = 'sonnet-4.5',
  onModelChange,
}: {
  selectedModel?: string
  onModelChange?: (model: Model) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [selected, setSelected] = useState(models.find((m) => m.id === selectedModel) || models[0])

  const handleSelect = (model: Model) => {
    setSelected(model)
    setIsOpen(false)
    onModelChange?.(model)
  }

  return (
    <div className='relative'>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className='flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-[#8a8a8f] transition-all duration-200 hover:bg-white/5 hover:text-white active:scale-95'
      >
        {selected.icon}
        <span>{selected.name}</span>
        <ChevronDown className={`size-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className='fixed inset-0 z-40' onClick={() => setIsOpen(false)} />
          <div className='animate-in slide-in-from-bottom-2 fade-in absolute bottom-full left-0 z-50 mb-2 min-w-[220px] overflow-hidden rounded-xl border border-white/10 bg-[#1a1a1e]/95 shadow-2xl shadow-black/50 backdrop-blur-xl duration-200'>
            <div className='p-1.5'>
              <div className='px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#5a5a5f]'>
                Select Model
              </div>
              {models.map((model) => (
                <button
                  key={model.id}
                  onClick={() => handleSelect(model)}
                  className={`w-full rounded-lg px-2.5 py-2 text-left transition-all duration-150 ${
                    selected.id === model.id
                      ? 'bg-white/10 text-white'
                      : 'text-[#a0a0a5] hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className='flex items-center gap-3'>
                    <div className='flex-shrink-0'>{model.icon}</div>
                    <div className='min-w-0 flex-1'>
                      <div className='flex items-center gap-2'>
                        <span className='text-sm font-medium'>{model.name}</span>
                        {model.badge && (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              model.badge === 'Pro'
                                ? 'bg-purple-500/20 text-purple-300'
                                : 'bg-blue-500/20 text-blue-300'
                            }`}
                          >
                            {model.badge}
                          </span>
                        )}
                      </div>
                      <span className='text-[11px] text-[#6a6a6f]'>{model.description}</span>
                    </div>
                    {selected.id === model.id && <Check className='size-4 flex-shrink-0 text-blue-400' />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ChatInput({
  onSend,
  placeholder = 'What do you want to build?',
  initialMessage = '',
  disabled = false,
}: {
  onSend?: (message: string) => void
  placeholder?: string
  initialMessage?: string
  disabled?: boolean
}) {
  const [message, setMessage] = useState(initialMessage)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [message])

  const handleSubmit = () => {
    if (message.trim()) {
      onSend?.(message)
      setMessage('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className='relative mx-auto w-full max-w-[680px]'>
      <div className='pointer-events-none absolute -inset-[1px] rounded-2xl bg-gradient-to-b from-white/[0.08] to-transparent' />
      <div className='relative rounded-2xl bg-[#1e1e22] ring-1 ring-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_2px_20px_rgba(0,0,0,0.4)]'>
        <div className='relative'>
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className='min-h-[80px] max-h-[200px] w-full resize-none bg-transparent px-5 pb-3 pt-5 text-[15px] text-white placeholder-[#5a5a5f] focus:outline-none'
            style={{ height: '80px' }}
          />
        </div>

        <div className='flex items-center justify-between px-3 pb-3 pt-1'>
          <div className='flex items-center gap-1'>
            <div className='relative'>
              <button
                onClick={() => setShowAttachMenu(!showAttachMenu)}
                className='flex size-8 items-center justify-center rounded-full bg-white/[0.08] text-[#8a8a8f] transition-all duration-200 hover:bg-white/[0.12] hover:text-white active:scale-95'
              >
                <Plus className={`size-4 transition-transform duration-200 ${showAttachMenu ? 'rotate-45' : ''}`} />
              </button>

              {showAttachMenu && (
                <>
                  <div className='fixed inset-0 z-40' onClick={() => setShowAttachMenu(false)} />
                  <div className='animate-in slide-in-from-bottom-2 fade-in absolute bottom-full left-0 z-50 mb-2 overflow-hidden rounded-xl border border-white/10 bg-[#1a1a1e]/95 shadow-2xl shadow-black/50 backdrop-blur-xl duration-200'>
                    <div className='min-w-[180px] p-1.5'>
                      {[
                        { icon: <Paperclip className='size-4' />, label: 'Upload file' },
                        { icon: <Image className='size-4' />, label: 'Add image' },
                        { icon: <FileCode className='size-4' />, label: 'Import code' },
                      ].map((item, i) => (
                        <button
                          key={i}
                          className='flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[#a0a0a5] transition-all duration-150 hover:bg-white/5 hover:text-white'
                        >
                          {item.icon}
                          <span className='text-sm'>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <ModelSelector />
          </div>

          <div className='flex-1' />

          <div className='flex items-center gap-2'>
            <button className='flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-[#6a6a6f] transition-all duration-200 hover:bg-white/5 hover:text-white'>
              <Lightbulb className='size-4' />
              <span className='hidden sm:inline'>Plan</span>
            </button>

            <button
              onClick={handleSubmit}
              disabled={!message.trim() || disabled}
              className='flex items-center gap-2 rounded-full bg-[#1488fc] px-4 py-2 text-sm font-medium text-white shadow-[0_0_20px_rgba(20,136,252,0.3)] transition-all duration-200 hover:bg-[#1a94ff] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40'
            >
              <span className='hidden sm:inline'>Build now</span>
              <SendHorizontal className='size-4' />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RayBackground() {
  return (
    <div className='pointer-events-none absolute inset-0 h-full w-full select-none overflow-hidden'>
      <div className='absolute inset-0 bg-[#0f0f0f]' />
      <div
        className='absolute left-1/2 h-[1800px] w-[4000px] -translate-x-1/2 sm:w-[6000px]'
        style={{
          background:
            'radial-gradient(circle at center 800px, rgba(20, 136, 252, 0.8) 0%, rgba(20, 136, 252, 0.35) 14%, rgba(20, 136, 252, 0.18) 18%, rgba(20, 136, 252, 0.08) 22%, rgba(17, 17, 20, 0.2) 25%)',
        }}
      />
      <div
        className='absolute left-1/2 top-[175px] h-[1600px] w-[1600px] sm:top-1/2 sm:h-[2865px] sm:w-[3043px]'
        style={{ transform: 'translate(-50%) rotate(180deg)' }}
      >
        <div
          className='absolute -mt-[13px] h-full w-full rounded-full'
          style={{
            background: 'radial-gradient(43.89% 25.74% at 50.02% 97.24%, #111114 0%, #0f0f0f 100%)',
            border: '16px solid white',
            transform: 'rotate(180deg)',
            zIndex: 5,
          }}
        />
        <div
          className='absolute -mt-[11px] h-full w-full rounded-full bg-[#0f0f0f]'
          style={{ border: '23px solid #b7d7f6', transform: 'rotate(180deg)', zIndex: 4 }}
        />
        <div
          className='absolute -mt-[8px] h-full w-full rounded-full bg-[#0f0f0f]'
          style={{ border: '23px solid #8fc1f2', transform: 'rotate(180deg)', zIndex: 3 }}
        />
        <div
          className='absolute -mt-[4px] h-full w-full rounded-full bg-[#0f0f0f]'
          style={{ border: '23px solid #64acf6', transform: 'rotate(180deg)', zIndex: 2 }}
        />
        <div
          className='absolute h-full w-full rounded-full bg-[#0f0f0f]'
          style={{
            border: '20px solid #1172e2',
            boxShadow: '0 -15px 24.8px rgba(17, 114, 226, 0.6)',
            transform: 'rotate(180deg)',
            zIndex: 1,
          }}
        />
      </div>
    </div>
  )
}

function AnnouncementBadge({ text, href = '#' }: { text: string; href?: string }) {
  const content = (
    <>
      <span
        className='pointer-events-none absolute left-0 right-0 top-0 h-1/2 opacity-70 mix-blend-overlay'
        style={{ background: 'radial-gradient(ellipse at center top, rgba(255, 255, 255, 0.15) 0%, transparent 70%)' }}
      />
      <span
        className='absolute -top-px left-1/2 h-[2px] w-[100px] -translate-x-1/2 opacity-60'
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(37, 119, 255, 0.8) 20%, rgba(126, 93, 225, 0.8) 50%, rgba(59, 130, 246, 0.8) 80%, transparent 100%)',
          filter: 'blur(0.5px)',
        }}
      />
      <Bolt className='relative z-10 size-4 text-white' />
      <span className='relative z-10 font-medium text-white'>{text}</span>
    </>
  )

  const className =
    'relative inline-flex items-center gap-2 overflow-hidden rounded-full px-5 py-2 min-h-[40px] text-sm transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer'
  const style = {
    background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))',
    backdropFilter: 'blur(20px) saturate(140%)',
    boxShadow:
      'inset 0 1px rgba(255,255,255,0.2), inset 0 -1px rgba(0,0,0,0.1), 0 8px 32px -8px rgba(0,0,0,0.1), 0 0 0 1px rgba(255,255,255,0.08)',
  }

  return href !== '#' ? (
    <a href={href} target='_blank' rel='noopener noreferrer' className={className} style={style}>
      {content}
    </a>
  ) : (
    <button className={className} style={style}>
      {content}
    </button>
  )
}

function ImportButtons({ onImport }: { onImport?: (source: string) => void }) {
  return (
    <div className='flex items-center justify-center gap-4'>
      <span className='text-sm text-[#6a6a6f]'>or import from</span>
      <div className='flex gap-2'>
        {[
          { id: 'figma', name: 'Figma', icon: <FigmaIcon className='size-4' /> },
          { id: 'github', name: 'GitHub', icon: <GitBranch className='size-4' /> },
        ].map((option) => (
          <button
            key={option.id}
            onClick={() => onImport?.(option.id)}
            className='flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0f0f0f] px-3 py-1.5 text-xs font-medium text-[#8a8a8f] transition-all duration-200 hover:bg-[#1a1a1e] hover:text-white active:scale-95'
          >
            {option.icon}
            <span>{option.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

interface BoltChatProps {
  title?: string
  subtitle?: string
  announcementText?: string
  announcementHref?: string
  placeholder?: string
  initialMessage?: string
  chatFeed?: React.ReactNode
  inputDisabled?: boolean
  hideHero?: boolean
  onSend?: (message: string) => void
  onImport?: (source: string) => void
}

export function BoltStyleChat({
  title = 'What will you',
  subtitle = 'Create stunning apps and websites by chatting with AI.',
  announcementText = 'Introducing Bolt V2',
  announcementHref = '#',
  placeholder = 'What do you want to build?',
  initialMessage = '',
  chatFeed,
  inputDisabled = false,
  hideHero = false,
  onSend,
  onImport,
}: BoltChatProps) {
  return (
    <div className='relative flex min-h-screen w-full flex-col items-center overflow-hidden bg-[#0f0f0f]'>
      <RayBackground />

      {!hideHero && (
        <div className='absolute top-[70px] z-10'>
          <AnnouncementBadge text={announcementText} href={announcementHref} />
        </div>
      )}

      <div className='relative z-10 flex w-full flex-1 flex-col items-center justify-center px-4 pb-10 pt-36 sm:pt-40'>
        {!hideHero && (
          <div className='mb-5 text-center'>
            <h1 className='mb-1 text-4xl font-bold tracking-tight text-white sm:text-5xl'>
              {title}{' '}
              <span className='bg-gradient-to-b from-[#4da5fc] via-[#4da5fc] to-white bg-clip-text italic text-transparent'>
                build
              </span>{' '}
              today?
            </h1>
            <p className='text-base font-semibold text-[#8a8a8f] sm:text-lg'>{subtitle}</p>
          </div>
        )}

        {chatFeed && (
          <div
            className={`mb-4 w-full max-w-[700px] overflow-y-auto animate-in fade-in duration-300 ${
              hideHero ? '-mt-8 max-h-[380px]' : 'max-h-[320px]'
            }`}
          >
            {chatFeed}
          </div>
        )}

        <div className='mb-5 mt-1 w-full max-w-[700px] shrink-0 sm:mb-6'>
          <ChatInput
            placeholder={placeholder}
            initialMessage={initialMessage}
            disabled={inputDisabled}
            onSend={onSend}
          />
        </div>

        <ImportButtons onImport={onImport} />
      </div>
    </div>
  )
}
