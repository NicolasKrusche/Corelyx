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
  Lock,
  Paperclip,
  Plus,
  SendHorizontal,
  Sparkles,
  Zap,
} from 'lucide-react'

export interface PlatformModel {
  id: string
  label: string
  sublabel: string
  tier: 'free' | 'standard' | 'premium'
  locked?: boolean
}

function modelIcon(id: string): React.ReactNode {
  if (id.includes('sonnet'))    return <Zap       className='size-4 text-blue-400' />
  if (id.includes('haiku'))     return <Brain     className='size-4 text-emerald-400' />
  if (id.includes('opus'))      return <Sparkles  className='size-4 text-purple-400' />
  if (id.includes('gpt-4o-mini')) return <Zap     className='size-4 text-green-400' />
  if (id.includes('gpt-4o'))    return <Sparkles  className='size-4 text-green-400' />
  if (id.includes('gemini'))    return <Brain     className='size-4 text-cyan-400' />
  if (id.includes('qwen'))      return <Bolt      className='size-4 text-amber-400' />
  return <Sparkles className='size-4 text-muted-foreground' />
}

const TIER_UPGRADE_LABEL: Record<string, string> = {
  standard: 'Solo',
  premium: 'Team or Scale',
}

export function ModelSelector({
  models,
  selectedModelId,
  onModelChange,
}: {
  models: PlatformModel[]
  selectedModelId: string
  onModelChange: (id: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [upgradeMsg, setUpgradeMsg] = useState<string | null>(null)

  if (models.length === 0) return null

  const selected = models.find((m) => m.id === selectedModelId) ?? models.find((m) => !m.locked) ?? models[0]

  const handleClick = (model: PlatformModel) => {
    if (model.locked) {
      const plan = TIER_UPGRADE_LABEL[model.tier] ?? 'a higher plan'
      setUpgradeMsg(`${model.label} requires ${plan}. Upgrade your plan to use this model.`)
      return
    }
    setUpgradeMsg(null)
    onModelChange(model.id)
    setIsOpen(false)
  }

  return (
    <div className='relative'>
      <button
        type='button'
        onClick={() => { setIsOpen(!isOpen); setUpgradeMsg(null) }}
        className='flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:bg-accent/50 hover:text-foreground active:scale-95'
      >
        {modelIcon(selected.id)}
        <span>{selected.label}</span>
        <ChevronDown className={`size-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className='fixed inset-0 z-40' onClick={() => setIsOpen(false)} />
          <div className='animate-in slide-in-from-bottom-2 fade-in absolute bottom-full left-0 z-50 mb-2 min-w-[240px] overflow-hidden rounded-xl border border-border bg-popover/95 shadow-2xl shadow-black/20 backdrop-blur-xl duration-200'>
            <div className='p-1.5'>
              <div className='px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60'>
                Select Model
              </div>

              {models.map((model) => (
                <button
                  key={model.id}
                  type='button'
                  onClick={() => handleClick(model)}
                  className={`w-full rounded-lg px-2.5 py-2 text-left transition-all duration-150 ${
                    model.locked
                      ? 'cursor-pointer opacity-60 hover:opacity-80 hover:bg-accent/30'
                      : selected.id === model.id
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  }`}
                >
                  <div className='flex items-center gap-3'>
                    <div className='flex-shrink-0'>
                      {model.locked
                        ? <Lock className='size-4 text-muted-foreground/50' />
                        : modelIcon(model.id)
                      }
                    </div>
                    <div className='min-w-0 flex-1'>
                      <span className='text-sm font-medium'>{model.label}</span>
                      <p className='text-[11px] text-muted-foreground/70'>{model.sublabel}</p>
                    </div>
                    {!model.locked && selected.id === model.id && (
                      <Check className='size-4 flex-shrink-0 text-primary' />
                    )}
                  </div>
                </button>
              ))}

              {upgradeMsg && (
                <div className='mx-1.5 mb-1 mt-1 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400'>
                  {upgradeMsg}
                </div>
              )}
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
  availableModels = [],
  selectedModelId = '',
  onModelChange,
}: {
  onSend?: (message: string) => void
  onPlan?: (message: string) => void
  placeholder?: string
  initialMessage?: string
  disabled?: boolean
  availableModels?: PlatformModel[]
  selectedModelId?: string
  onModelChange?: (id: string) => void
}) {
  const [message, setMessage] = useState(initialMessage)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const codeInputRef = useRef<HTMLInputElement>(null)

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
                      <input
                        ref={fileInputRef}
                        type='file'
                        className='hidden'
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            onSend?.(`[Attached file: ${file.name}]`)
                          }
                          e.currentTarget.value = ''
                          setShowAttachMenu(false)
                        }}
                      />
                      <input
                        ref={imageInputRef}
                        type='file'
                        accept='image/*'
                        className='hidden'
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            onSend?.(`[Attached image: ${file.name}]`)
                          }
                          e.currentTarget.value = ''
                          setShowAttachMenu(false)
                        }}
                      />
                      <input
                        ref={codeInputRef}
                        type='file'
                        accept='.json,.ts,.js,.py,.txt,.md,.sql,.yaml,.yml'
                        className='hidden'
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            const text = await file.text()
                            onSend?.(`[Imported code from ${file.name}]:\n\n\`\`\`\n${text.slice(0, 4000)}\n\`\`\``)
                          }
                          e.currentTarget.value = ''
                          setShowAttachMenu(false)
                        }}
                      />
                      {[
                        { icon: <Paperclip className='size-4' />, label: 'Upload file', ref: fileInputRef },
                        { icon: <ImageIcon className='size-4' />, label: 'Add image', ref: imageInputRef },
                        { icon: <FileCode className='size-4' />, label: 'Import code', ref: codeInputRef },
                      ].map((item, i) => (
                        <button
                          key={i}
                          type='button'
                          onClick={() => item.ref.current?.click()}
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
            {availableModels.length > 1 && onModelChange && (
              <ModelSelector
                models={availableModels}
                selectedModelId={selectedModelId}
                onModelChange={onModelChange}
              />
            )}
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

  if (href !== '#') {
    return (
      <a href={href} target='_blank' rel='noopener noreferrer' className={className} style={style}>
        {content}
      </a>
    )
  }
  return (
    <span className={className.replace('cursor-pointer', '')} style={style}>
      {content}
    </span>
  )
}

function ImportButtons({ onImport }: { onImport?: (source: string) => void }) {
  return (
    <div className='flex items-center justify-center gap-4'>
      <span className='text-sm text-muted-foreground'>or start from</span>
      <div className='flex gap-2'>
        {[
          { id: 'browse', name: 'Browse', icon: <GitBranch className='size-4' /> },
          { id: 'json', name: 'Import', icon: <FileCode className='size-4' /> },
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
  availableModels?: PlatformModel[]
  selectedModelId?: string
  onModelChange?: (id: string) => void
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
  availableModels = [],
  selectedModelId = '',
  onModelChange,
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
            availableModels={availableModels}
            selectedModelId={selectedModelId}
            onModelChange={onModelChange}
          />
        </div>

        <ImportButtons onImport={onImport} />
      </div>
    </div>
  )
}
