'use client'

import React, { useEffect, useRef, useState } from 'react'
import {
  Bolt,
  Brain,
  Check,
  ChevronDown,
  FileCode,
  GitBranch,
  Image as ImageIcon,
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
        type='button'
        onClick={() => setIsOpen(!isOpen)}
        className='flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:bg-accent/50 hover:text-foreground active:scale-95'
      >
        {selected.icon}
        <span>{selected.name}</span>
        <ChevronDown className={`size-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className='fixed inset-0 z-40' onClick={() => setIsOpen(false)} />
          <div className='animate-in slide-in-from-bottom-2 fade-in absolute bottom-full left-0 z-50 mb-2 min-w-[220px] overflow-hidden rounded-xl border border-border bg-popover/95 shadow-2xl shadow-black/20 backdrop-blur-xl duration-200'>
            <div className='p-1.5'>
              <div className='px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60'>
                Select Model
              </div>
              {models.map((model) => (
                <button
                  key={model.id}
                  type='button'
                  onClick={() => handleSelect(model)}
                  className={`w-full rounded-lg px-2.5 py-2 text-left transition-all duration-150 ${
                    selected.id === model.id
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
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
                                ? 'bg-purple-500/20 text-purple-400'
                                : 'bg-primary/20 text-primary'
                            }`}
                          >
                            {model.badge}
                          </span>
                        )}
                      </div>
                      <span className='text-[11px] text-muted-foreground/70'>{model.description}</span>
                    </div>
                    {selected.id === model.id && <Check className='size-4 flex-shrink-0 text-primary' />}
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
  onPlan,
  placeholder = 'What do you want to build?',
  initialMessage = '',
  disabled = false,
}: {
  onSend?: (message: string) => void
  onPlan?: (message: string) => void
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

  const handlePlan = () => {
    if (message.trim()) {
      onPlan?.(message)
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
      <div className='pointer-events-none absolute -inset-[1px] rounded-2xl bg-gradient-to-b from-border/40 to-transparent' />
      <div className='relative rounded-2xl border border-border bg-card shadow-lg ring-1 ring-border/30'>
        <div className='relative'>
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className='min-h-[80px] max-h-[200px] w-full resize-none bg-transparent px-5 pb-3 pt-5 text-[15px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none'
            style={{ height: '80px' }}
          />
        </div>

        <div className='flex items-center justify-between px-3 pb-3 pt-1'>
          <div className='flex items-center gap-1'>
            <div className='relative'>
              <button
                type='button'
                onClick={() => setShowAttachMenu(!showAttachMenu)}
                className='flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-95'
              >
                <Plus className={`size-4 transition-transform duration-200 ${showAttachMenu ? 'rotate-45' : ''}`} />
              </button>

              {showAttachMenu && (
                <>
                  <div className='fixed inset-0 z-40' onClick={() => setShowAttachMenu(false)} />
                  <div className='animate-in slide-in-from-bottom-2 fade-in absolute bottom-full left-0 z-50 mb-2 overflow-hidden rounded-xl border border-border bg-popover/95 shadow-2xl shadow-black/20 backdrop-blur-xl duration-200'>
                    <div className='min-w-[180px] p-1.5'>
                      {[
                        { icon: <Paperclip className='size-4' />, label: 'Upload file' },
                        { icon: <ImageIcon className='size-4' />, label: 'Add image' },
                        { icon: <FileCode className='size-4' />, label: 'Import code' },
                      ].map((item, i) => (
                        <button
                          key={i}
                          type='button'
                          className='flex w-full items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground transition-all duration-150 hover:bg-accent/50 hover:text-foreground'
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
            <button
              type='button'
              onClick={handlePlan}
              disabled={!message.trim() || disabled}
              className='flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-muted-foreground/70 transition-all duration-200 hover:bg-accent/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40'
            >
              <Lightbulb className='size-4' />
              <span className='hidden sm:inline'>Plan</span>
            </button>

            <button
              type='button'
              onClick={handleSubmit}
              disabled={!message.trim() || disabled}
              className='flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-200 hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40'
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
      {/* Base background — uses theme background color */}
      <div className='absolute inset-0 bg-background' />
      {/* Primary-colored radial glow emanating from bottom */}
      <div
        className='absolute left-1/2 h-[1800px] w-[4000px] -translate-x-1/2 sm:w-[6000px]'
        style={{
          background:
            'radial-gradient(circle at center 800px, hsl(var(--primary) / 0.75) 0%, hsl(var(--primary) / 0.32) 14%, hsl(var(--primary) / 0.15) 18%, hsl(var(--primary) / 0.06) 22%, transparent 25%)',
        }}
      />
      {/* Arc rings */}
      <div
        className='absolute left-1/2 top-[175px] h-[1600px] w-[1600px] sm:top-1/2 sm:h-[2865px] sm:w-[3043px]'
        style={{ transform: 'translate(-50%) rotate(180deg)' }}
      >
        {/* Innermost fill — same as page background to cut out the center */}
        <div
          className='absolute -mt-[13px] h-full w-full rounded-full'
          style={{
            background: 'hsl(var(--background))',
            border: '16px solid hsl(var(--background))',
            transform: 'rotate(180deg)',
            zIndex: 5,
          }}
        />
        <div
          className='absolute -mt-[11px] h-full w-full rounded-full'
          style={{
            background: 'hsl(var(--background))',
            border: '23px solid hsl(var(--primary) / 0.25)',
            transform: 'rotate(180deg)',
            zIndex: 4,
          }}
        />
        <div
          className='absolute -mt-[8px] h-full w-full rounded-full'
          style={{
            background: 'hsl(var(--background))',
            border: '23px solid hsl(var(--primary) / 0.45)',
            transform: 'rotate(180deg)',
            zIndex: 3,
          }}
        />
        <div
          className='absolute -mt-[4px] h-full w-full rounded-full'
          style={{
            background: 'hsl(var(--background))',
            border: '23px solid hsl(var(--primary) / 0.65)',
            transform: 'rotate(180deg)',
            zIndex: 2,
          }}
        />
        <div
          className='absolute h-full w-full rounded-full'
          style={{
            background: 'hsl(var(--background))',
            border: '20px solid hsl(var(--primary))',
            boxShadow: '0 -15px 24.8px hsl(var(--primary) / 0.6)',
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
            'linear-gradient(90deg, transparent 0%, hsl(var(--primary) / 0.8) 30%, hsl(var(--primary) / 0.6) 70%, transparent 100%)',
          filter: 'blur(0.5px)',
        }}
      />
      <Bolt className='relative z-10 size-4 text-foreground' />
      <span className='relative z-10 font-medium text-foreground'>{text}</span>
    </>
  )

  const className =
    'relative inline-flex items-center gap-2 overflow-hidden rounded-full px-5 py-2 min-h-[40px] text-sm transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer border border-border/50'
  const style = {
    background: 'hsl(var(--card) / 0.7)',
    backdropFilter: 'blur(20px) saturate(140%)',
    boxShadow: 'inset 0 1px hsl(var(--border) / 0.5), 0 8px 32px -8px hsl(var(--primary) / 0.15)',
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
      <span className='text-sm text-muted-foreground'>or start from</span>
      <div className='flex gap-2'>
        {[
          { id: 'browse', name: 'Browse', icon: <GitBranch className='size-4' /> },
          { id: 'json', name: 'Import JSON', icon: <FileCode className='size-4' /> },
        ].map((option) => (
          <button
            key={option.id}
            type='button'
            onClick={() => onImport?.(option.id)}
            className='flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground active:scale-95'
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
  onPlan?: (message: string) => void
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
  onPlan,
  onImport,
}: BoltChatProps) {
  return (
    <div className='relative flex min-h-screen w-full flex-col items-center overflow-hidden bg-background text-foreground'>
      <RayBackground />

      {!hideHero && (
        <div className='absolute top-[70px] z-10'>
          <AnnouncementBadge text={announcementText} href={announcementHref} />
        </div>
      )}

      <div className='relative z-10 flex w-full flex-1 flex-col items-center justify-center px-4 pb-10 pt-36 sm:pt-40'>
        {!hideHero && (
          <div className='mb-5 text-center'>
            <h1 className='mb-1 text-4xl font-bold tracking-tight sm:text-5xl'>
              {title}{' '}
              <span className='-mx-1 inline-block px-1 bg-gradient-to-b from-primary/80 via-primary to-primary/60 bg-clip-text italic text-transparent'>
                build
              </span>{' '}
              today?
            </h1>
            <p className='text-base font-semibold text-muted-foreground sm:text-lg'>{subtitle}</p>
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
            onPlan={onPlan}
          />
        </div>

        <ImportButtons onImport={onImport} />
      </div>
    </div>
  )
}
