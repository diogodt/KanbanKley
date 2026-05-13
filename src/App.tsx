import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  DragEvent,
  FormEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import AddIcon from '@mui/icons-material/Add'
import ArchiveOutlinedIcon from '@mui/icons-material/ArchiveOutlined'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import CloseIcon from '@mui/icons-material/Close'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlineOutlined'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined'
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined'
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined'
import SearchIcon from '@mui/icons-material/Search'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined'
import Tooltip from '@mui/material/Tooltip'

type ColumnId = string
type Priority = 'Baixa' | 'Normal' | 'Alta'
type ThemeMode = 'dark' | 'light' | 'kley'
type View = 'board' | 'settings' | 'detail'

type Column = {
  id: ColumnId
  title: string
}

type TaskImage = {
  id: string
  name: string
  type: string
  size: number
  dataUrl: string
  addedAt: string
}

type Card = {
  id: string
  title: string
  description: string
  assignee: string
  columnId: ColumnId
  priority: Priority
  createdAt: string
  images: TaskImage[]
}

type Draft = {
  title: string
  description: string
  assignee: string
  priority: Priority
  images: TaskImage[]
}

type BoardState = {
  columns: Column[]
  cards: Card[]
  theme: ThemeMode
}

type DragState = {
  cardId: string
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  offsetX: number
  offsetY: number
  width: number
  hasMoved: boolean
}

const STORAGE_KEY = 'kanbankley:v2'
const LEGACY_STORAGE_KEY = 'kanbankley:v1'
const MAX_IMAGES_PER_CARD = 8
const MAX_IMAGE_SIZE = 2 * 1024 * 1024

const defaultColumns: Column[] = [
  { id: 'backlog', title: 'A fazer' },
  { id: 'active', title: 'Em andamento' },
  { id: 'done', title: 'Concluido' },
]

const columnAccents = [
  '#58c7a4',
  '#e6b04b',
  '#8d8cff',
  '#e86f62',
  '#6db7ff',
  '#d890ff',
  '#ff6fb1',
]

const emptyMessages = [
  'Nada esperando aqui.',
  'Nenhuma missao ativa.',
  'Vitorias aparecem aqui.',
  'Sem cards nesta coluna.',
]

const themeOptions: Array<{
  value: ThemeMode
  label: string
  description: string
}> = [
  { value: 'dark', label: 'Dark', description: 'Escuro e discreto' },
  { value: 'light', label: 'Light', description: 'Claro e limpo' },
  { value: 'kley', label: 'Kley', description: 'Arco-iris sem vergonha' },
]

const initialCards: Card[] = [
  {
    id: 'card-briefing',
    title: 'Mapear fluxo do Kanban',
    description: 'Definir o essencial: criar, mover, editar e persistir localmente.',
    assignee: 'Kley',
    columnId: 'backlog',
    priority: 'Alta',
    createdAt: new Date().toISOString(),
    images: [],
  },
  {
    id: 'card-ui',
    title: 'Lapidar UI minimalista',
    description: 'Escuro, rapido, limpo e sem cara de planilha remendada.',
    assignee: 'Diogo',
    columnId: 'active',
    priority: 'Normal',
    createdAt: new Date().toISOString(),
    images: [],
  },
]

const defaultBoard: BoardState = {
  columns: defaultColumns,
  cards: initialCards,
  theme: 'dark',
}

const blankDraft: Draft = {
  title: '',
  description: '',
  assignee: '',
  priority: 'Normal',
  images: [],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPriority(value: unknown): value is Priority {
  return value === 'Baixa' || value === 'Normal' || value === 'Alta'
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light' || value === 'kley'
}

function freshDraft(): Draft {
  return {
    ...blankDraft,
    images: [],
  }
}

function sanitizeColumns(value: unknown): Column[] {
  if (!Array.isArray(value)) return defaultColumns

  const seen = new Set<string>()
  const columns = value
    .filter(isRecord)
    .map((column) => ({
      id: typeof column.id === 'string' ? column.id : '',
      title: typeof column.title === 'string' ? column.title.trim() : '',
    }))
    .filter((column) => {
      if (!column.id || !column.title || seen.has(column.id)) return false
      seen.add(column.id)
      return true
    })

  return columns.length > 0 ? columns : defaultColumns
}

function sanitizeImages(value: unknown): TaskImage[] {
  if (!Array.isArray(value)) return []

  return value
    .filter(isRecord)
    .map((image) => ({
      id: typeof image.id === 'string' && image.id ? image.id : crypto.randomUUID(),
      name: typeof image.name === 'string' && image.name.trim() ? image.name.trim() : 'imagem',
      type: typeof image.type === 'string' && image.type ? image.type : 'image/*',
      size: typeof image.size === 'number' && Number.isFinite(image.size) ? image.size : 0,
      dataUrl: typeof image.dataUrl === 'string' ? image.dataUrl : '',
      addedAt: typeof image.addedAt === 'string' ? image.addedAt : new Date().toISOString(),
    }))
    .filter((image) => image.dataUrl.startsWith('data:image/'))
    .slice(0, MAX_IMAGES_PER_CARD)
}

function sanitizeCards(value: unknown, columns: Column[]): Card[] {
  if (!Array.isArray(value)) return initialCards

  const fallbackColumnId = columns[0]?.id ?? 'backlog'
  const columnIds = new Set(columns.map((column) => column.id))

  return value.filter(isRecord).map((card) => ({
    id: typeof card.id === 'string' && card.id ? card.id : crypto.randomUUID(),
    title: typeof card.title === 'string' ? card.title : 'Sem titulo',
    description: typeof card.description === 'string' ? card.description : '',
    assignee: typeof card.assignee === 'string' ? card.assignee : '',
    columnId:
      typeof card.columnId === 'string' && columnIds.has(card.columnId)
        ? card.columnId
        : fallbackColumnId,
    priority: isPriority(card.priority) ? card.priority : 'Normal',
    createdAt: typeof card.createdAt === 'string' ? card.createdAt : new Date().toISOString(),
    images: sanitizeImages(card.images),
  }))
}

function normalizeBoard(value: unknown): BoardState {
  if (!isRecord(value)) return defaultBoard
  const columns = sanitizeColumns(value.columns)
  return {
    columns,
    cards: sanitizeCards(value.cards, columns),
    theme: isThemeMode(value.theme) ? value.theme : 'dark',
  }
}

function loadBoard(): BoardState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored) return normalizeBoard(JSON.parse(stored))

    const legacyCards = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacyCards) {
      return {
        columns: defaultColumns,
        cards: sanitizeCards(JSON.parse(legacyCards), defaultColumns),
        theme: 'dark',
      }
    }

    return defaultBoard
  } catch {
    return defaultBoard
  }
}

function normalizeText(value: string) {
  return value.trim().toLowerCase()
}

function columnAccent(index: number) {
  return columnAccents[index % columnAccents.length]
}

function columnAccentStyle(index: number): CSSProperties {
  return { backgroundColor: columnAccent(index) }
}

function emptyMessage(index: number) {
  return emptyMessages[index] ?? emptyMessages[3]
}

function makeCard(columnId: ColumnId, draft: Draft): Card {
  return {
    id: crypto.randomUUID(),
    title: draft.title.trim(),
    description: draft.description.trim(),
    assignee: draft.assignee.trim(),
    columnId,
    priority: draft.priority,
    createdAt: new Date().toISOString(),
    images: draft.images,
  }
}

function makeColumn(title: string): Column {
  return {
    id: `column-${crypto.randomUUID()}`,
    title: title.trim(),
  }
}

function makeTaskImage(file: File): Promise<TaskImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Arquivo invalido.'))
        return
      }

      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: reader.result,
        addedAt: new Date().toISOString(),
      })
    }

    reader.onerror = () => reject(new Error(`Nao consegui ler ${file.name}.`))
    reader.readAsDataURL(file)
  })
}

async function readImageFiles(files: FileList | null, capacity: number) {
  if (!files || files.length === 0) return { images: [] as TaskImage[], message: '' }
  if (capacity <= 0) {
    return {
      images: [] as TaskImage[],
      message: `Limite de ${MAX_IMAGES_PER_CARD} imagens por tarefa.`,
    }
  }

  const pickedFiles = Array.from(files)
  const imageFiles = pickedFiles.filter((file) => file.type.startsWith('image/'))
  const oversizedFiles = imageFiles.filter((file) => file.size > MAX_IMAGE_SIZE)
  const usableFiles = imageFiles
    .filter((file) => file.size <= MAX_IMAGE_SIZE)
    .slice(0, capacity)

  const messages = []
  if (imageFiles.length !== pickedFiles.length) {
    messages.push('Alguns arquivos foram ignorados porque nao eram imagens.')
  }
  if (oversizedFiles.length > 0) {
    messages.push('Imagens acima de 2 MB foram ignoradas.')
  }
  if (imageFiles.length - oversizedFiles.length > capacity) {
    messages.push(`A tarefa aceita ate ${MAX_IMAGES_PER_CARD} imagens.`)
  }

  const images = await Promise.all(usableFiles.map(makeTaskImage))
  return { images, message: messages.join(' ') }
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 KB'
  const kiloBytes = bytes / 1024
  if (kiloBytes < 1024) return `${Math.max(1, Math.round(kiloBytes))} KB`
  return `${(kiloBytes / 1024).toFixed(1)} MB`
}

function App() {
  const [board, setBoard] = useState<BoardState>(loadBoard)
  const [view, setView] = useState<View>('board')
  const [query, setQuery] = useState('')
  const [activeColumn, setActiveColumn] = useState<ColumnId>(board.columns[0]?.id ?? 'backlog')
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [newColumnTitle, setNewColumnTitle] = useState('')

  const { cards, columns, theme } = board
  const firstColumnId = columns[0]?.id ?? ''
  const selectedColumnId = columns.some((column) => column.id === activeColumn)
    ? activeColumn
    : firstColumnId
  const lastColumnId = columns[columns.length - 1]?.id
  const selectedCard = cards.find((card) => card.id === selectedCardId) ?? null

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(board))
  }, [board])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const filteredCards = useMemo(() => {
    const needle = normalizeText(query)
    if (!needle) return cards
    return cards.filter((card) =>
      [card.title, card.description, card.assignee, card.priority]
        .map(normalizeText)
        .some((value) => value.includes(needle)),
    )
  }, [cards, query])

  const stats = useMemo(
    () => ({
      total: cards.length,
      columns: columns.length,
      final: cards.filter((card) => card.columnId === lastColumnId).length,
    }),
    [cards, columns.length, lastColumnId],
  )

  function openTaskDialog(columnId = selectedColumnId) {
    setView('board')
    setActiveColumn(columnId || firstColumnId)
    setDraft(freshDraft())
    setIsTaskDialogOpen(true)
  }

  function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.title.trim() || !selectedColumnId) return

    setBoard((current) => ({
      ...current,
      cards: [makeCard(selectedColumnId, draft), ...current.cards],
    }))
    setDraft(freshDraft())
    setIsTaskDialogOpen(false)
  }

  function updateCard(cardId: string, patch: Partial<Card>) {
    setBoard((current) => ({
      ...current,
      cards: current.cards.map((card) =>
        card.id === cardId
          ? {
              ...card,
              ...patch,
              title: patch.title !== undefined ? patch.title : card.title,
            }
          : card,
      ),
    }))
  }

  function deleteCard(cardId: string) {
    setBoard((current) => ({
      ...current,
      cards: current.cards.filter((card) => card.id !== cardId),
    }))

    if (selectedCardId === cardId) {
      setSelectedCardId(null)
      setView('board')
    }
  }

  function moveCard(cardId: string, columnId: ColumnId) {
    updateCard(cardId, { columnId })
  }

  function openDetail(cardId: string) {
    setSelectedCardId(cardId)
    setView('detail')
  }

  function clearFinalColumn() {
    if (!lastColumnId) return
    setBoard((current) => ({
      ...current,
      cards: current.cards.filter((card) => card.columnId !== lastColumnId),
    }))
  }

  function addColumn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!newColumnTitle.trim()) return

    const column = makeColumn(newColumnTitle)
    setBoard((current) => ({
      ...current,
      columns: [...current.columns, column],
    }))
    setActiveColumn(column.id)
    setNewColumnTitle('')
  }

  function renameColumn(columnId: ColumnId, title: string) {
    setBoard((current) => ({
      ...current,
      columns: current.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column,
      ),
    }))
  }

  function deleteColumn(columnId: ColumnId) {
    if (columns.length <= 1) return

    const remainingColumns = columns.filter((column) => column.id !== columnId)
    const fallbackColumnId = remainingColumns[0].id

    setBoard((current) => ({
      ...current,
      columns: current.columns.filter((column) => column.id !== columnId),
      cards: current.cards.map((card) =>
        card.columnId === columnId ? { ...card, columnId: fallbackColumnId } : card,
      ),
    }))

    if (activeColumn === columnId) setActiveColumn(fallbackColumnId)
  }

  function reorderColumns(sourceId: ColumnId, targetId: ColumnId) {
    if (sourceId === targetId) return

    setBoard((current) => {
      const from = current.columns.findIndex((column) => column.id === sourceId)
      const to = current.columns.findIndex((column) => column.id === targetId)
      if (from < 0 || to < 0) return current

      const nextColumns = [...current.columns]
      const [moved] = nextColumns.splice(from, 1)
      nextColumns.splice(to, 0, moved)

      return {
        ...current,
        columns: nextColumns,
      }
    })
  }

  function setTheme(themeMode: ThemeMode) {
    setBoard((current) => ({
      ...current,
      theme: themeMode,
    }))
  }

  return (
    <main data-theme={theme} className="app-shell min-h-screen">
      <header className="app-header sticky top-0 z-20">
        <div className="flex w-full flex-col gap-4 px-4 py-4 md:px-8 lg:flex-row lg:items-center">
          <div className="flex min-w-fit items-center gap-3">
            <div className="brand-icon grid size-9 place-items-center rounded-lg">
              <CheckCircleOutlineIcon fontSize="small" />
            </div>
            <div>
              <h1 className="text-xl font-black leading-none tracking-normal">KanbanKley</h1>
              <p className="muted-text mt-1 text-xs font-medium">Missoes locais</p>
            </div>
          </div>

          <label className="field flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl px-4 lg:mx-4">
            <SearchIcon fontSize="small" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar..."
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[color:var(--placeholder)]"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Metric label="Total" value={stats.total} />
            <Metric label="Colunas" value={stats.columns} />
            <Metric label="Final" value={stats.final} />

            <button
              type="button"
              onClick={() => openTaskDialog()}
              className="primary-action inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black"
            >
              <AddIcon fontSize="small" />
              Nova tarefa
            </button>

            <Tooltip title={view === 'board' ? 'Configuracoes' : 'Voltar ao quadro'}>
              <button
                type="button"
                onClick={() => setView(view === 'board' ? 'settings' : 'board')}
                className="icon-button grid size-11 place-items-center rounded-xl"
              >
                {view === 'board' ? (
                  <SettingsOutlinedIcon fontSize="small" />
                ) : (
                  <ViewKanbanOutlinedIcon fontSize="small" />
                )}
              </button>
            </Tooltip>

            <Tooltip title="Limpar ultima coluna">
              <button
                type="button"
                onClick={clearFinalColumn}
                className="icon-button icon-button-danger grid size-11 place-items-center rounded-xl"
              >
                <ArchiveOutlinedIcon fontSize="small" />
              </button>
            </Tooltip>
          </div>
        </div>
      </header>

      {view === 'board' ? (
        <BoardView
          cards={filteredCards}
          columns={columns}
          onDeleteCard={deleteCard}
          onMoveCard={moveCard}
          onOpenDetail={openDetail}
          onOpenTaskDialog={openTaskDialog}
          onUpdateCard={updateCard}
        />
      ) : null}

      {view === 'settings' ? (
        <SettingsView
          cards={cards}
          columns={columns}
          newColumnTitle={newColumnTitle}
          onAddColumn={addColumn}
          onDeleteColumn={deleteColumn}
          onNewColumnTitleChange={setNewColumnTitle}
          onRenameColumn={renameColumn}
          onReorderColumns={reorderColumns}
          onReturn={() => setView('board')}
          onThemeChange={setTheme}
          theme={theme}
        />
      ) : null}

      {view === 'detail' && selectedCard ? (
        <TaskDetailView
          card={selectedCard}
          columns={columns}
          onBack={() => setView('board')}
          onDelete={() => deleteCard(selectedCard.id)}
          onUpdate={(patch) => updateCard(selectedCard.id, patch)}
        />
      ) : null}

      {isTaskDialogOpen ? (
        <TaskDialog
          activeColumn={selectedColumnId}
          columns={columns}
          draft={draft}
          onClose={() => setIsTaskDialogOpen(false)}
          onDraftChange={setDraft}
          onSetActiveColumn={setActiveColumn}
          onSubmit={submitDraft}
        />
      ) : null}
    </main>
  )
}

function BoardView({
  cards,
  columns,
  onDeleteCard,
  onMoveCard,
  onOpenDetail,
  onOpenTaskDialog,
  onUpdateCard,
}: {
  cards: Card[]
  columns: Column[]
  onDeleteCard: (cardId: string) => void
  onMoveCard: (cardId: string, columnId: ColumnId) => void
  onOpenDetail: (cardId: string) => void
  onOpenTaskDialog: (columnId: ColumnId) => void
  onUpdateCard: (cardId: string, patch: Partial<Card>) => void
}) {
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [dropColumnId, setDropColumnId] = useState<ColumnId | null>(null)
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  const [inlineTitle, setInlineTitle] = useState('')
  const dragDataRef = useRef<DragState | null>(null)
  const dropColumnIdRef = useRef<ColumnId | null>(null)
  const suppressClickRef = useRef(false)

  const draggedCard = dragState
    ? cards.find((card) => card.id === dragState.cardId) ?? null
    : null

  useEffect(() => {
    if (!dragState) return

    function setDropTarget(columnId: ColumnId | null) {
      dropColumnIdRef.current = columnId
      setDropColumnId(columnId)
    }

    function handlePointerMove(event: PointerEvent) {
      const current = dragDataRef.current
      if (!current || event.pointerId !== current.pointerId) return

      const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)
      const next = {
        ...current,
        x: event.clientX,
        y: event.clientY,
        hasMoved: current.hasMoved || distance > 6,
      }

      dragDataRef.current = next
      setDragState(next)

      if (next.hasMoved) {
        const target = document
          .elementsFromPoint(event.clientX, event.clientY)
          .find((element) => element instanceof HTMLElement && element.dataset.columnId)

        setDropTarget(target instanceof HTMLElement ? target.dataset.columnId ?? null : null)
      }
    }

    function handlePointerUp(event: PointerEvent) {
      const current = dragDataRef.current
      if (!current || event.pointerId !== current.pointerId) return

      if (current.hasMoved && dropColumnIdRef.current) {
        onMoveCard(current.cardId, dropColumnIdRef.current)
      }

      suppressClickRef.current = current.hasMoved
      dragDataRef.current = null
      setDragState(null)
      setDropTarget(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [dragState, onMoveCard])

  function startDrag(event: ReactPointerEvent<HTMLElement>, card: Card) {
    if (event.button !== 0) return

    const target = event.target as HTMLElement
    if (target.closest('button,input,textarea,select,a,[data-no-card-open]')) return

    const rect = event.currentTarget.getBoundingClientRect()
    const next = {
      cardId: card.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      hasMoved: false,
    }

    dragDataRef.current = next
    setDragState(next)
  }

  function openCard(cardId: string) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }

    onOpenDetail(cardId)
  }

  function startInlineEdit(card: Card) {
    setEditingTitleId(card.id)
    setInlineTitle(card.title)
  }

  function saveInlineTitle(card: Card) {
    const title = inlineTitle.trim()
    if (title && title !== card.title) {
      onUpdateCard(card.id, { title })
    }
    setEditingTitleId(null)
    setInlineTitle('')
  }

  return (
    <div className="w-full px-4 py-5 md:px-8">
      <section
        className="grid min-w-0 gap-4 overflow-x-auto pb-2"
        style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(280px, 1fr))` }}
      >
        {columns.map((column, index) => {
          const columnCards = cards.filter((card) => card.columnId === column.id)
          const isDropTarget = dropColumnId === column.id && dragState?.hasMoved

          return (
            <div
              key={column.id}
              data-column-id={column.id}
              className={`kanban-column flex min-h-[620px] min-w-0 flex-col rounded-xl p-3 ${
                isDropTarget ? 'kanban-column--drop' : ''
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="h-3 w-1 shrink-0 rounded-full"
                    style={columnAccentStyle(index)}
                  />
                  <h2 className="truncate text-sm font-black uppercase tracking-normal">
                    {column.title || 'Sem nome'}
                  </h2>
                  <span className="count-pill rounded-full px-2 py-0.5 text-xs font-bold">
                    {columnCards.length}
                  </span>
                </div>

                <Tooltip title="Adicionar nesta coluna">
                  <button
                    type="button"
                    onClick={() => onOpenTaskDialog(column.id)}
                    className="icon-button grid size-8 place-items-center rounded-lg"
                  >
                    <AddIcon fontSize="small" />
                  </button>
                </Tooltip>
              </div>

              <div className="flex flex-1 flex-col gap-3">
                {columnCards.map((card) => (
                  <article
                    key={card.id}
                    onPointerDown={(event) => startDrag(event, card)}
                    onClick={() => openCard(card.id)}
                    className={`kanban-card group cursor-grab rounded-xl p-4 active:cursor-grabbing ${
                      dragState?.cardId === card.id && dragState.hasMoved
                        ? 'kanban-card--dragging'
                        : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <DragIndicatorIcon className="card-drag-icon mt-0.5" fontSize="small" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          {editingTitleId === card.id ? (
                            <input
                              autoFocus
                              value={inlineTitle}
                              onBlur={() => saveInlineTitle(card)}
                              onChange={(event) => setInlineTitle(event.target.value)}
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') saveInlineTitle(card)
                                if (event.key === 'Escape') {
                                  setEditingTitleId(null)
                                  setInlineTitle('')
                                }
                              }}
                              className="field min-h-8 min-w-0 flex-1 rounded-md px-2 text-sm font-black leading-5"
                            />
                          ) : (
                            <button
                              type="button"
                              data-no-card-open
                              onClick={(event) => {
                                event.stopPropagation()
                                startInlineEdit(card)
                              }}
                              className="link-title-button min-w-0 flex-1 break-words text-left text-sm font-black leading-5"
                            >
                              {card.title || 'Sem titulo'}
                            </button>
                          )}

                          <div className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                            <Tooltip title="Abrir">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onOpenDetail(card.id)
                                }}
                                className="mini-icon-button grid size-7 place-items-center rounded-md"
                              >
                                <EditOutlinedIcon fontSize="inherit" />
                              </button>
                            </Tooltip>
                            <Tooltip title="Excluir">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onDeleteCard(card.id)
                                }}
                                className="mini-icon-button mini-icon-button-danger grid size-7 place-items-center rounded-md"
                              >
                                <DeleteOutlineIcon fontSize="inherit" />
                              </button>
                            </Tooltip>
                          </div>
                        </div>

                        {card.description ? (
                          <p className="muted-text mt-2 break-words text-sm leading-5">
                            {card.description}
                          </p>
                        ) : null}

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <span className="pill inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold">
                            <FlagOutlinedIcon fontSize="inherit" />
                            {card.priority}
                          </span>
                          {card.assignee ? (
                            <span className="assignee-pill rounded-md px-2 py-1 text-xs font-bold">
                              {card.assignee}
                            </span>
                          ) : null}
                          {card.images.length > 0 ? (
                            <span className="image-pill inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold">
                              <ImageOutlinedIcon fontSize="inherit" />
                              {card.images.length}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}

                {columnCards.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => onOpenTaskDialog(column.id)}
                    className="empty-column-button flex min-h-32 items-center justify-center rounded-xl border border-dashed px-4 text-sm font-bold"
                  >
                    {emptyMessage(index)}
                  </button>
                ) : null}
              </div>
            </div>
          )
        })}
      </section>

      {dragState && draggedCard ? (
        <DragPreview card={draggedCard} dragState={dragState} />
      ) : null}
    </div>
  )
}

function DragPreview({ card, dragState }: { card: Card; dragState: DragState }) {
  if (!dragState.hasMoved) return null

  return (
    <div
      className="task-preview pointer-events-none fixed z-50 rounded-xl p-4"
      style={{
        left: dragState.x - dragState.offsetX,
        top: dragState.y - dragState.offsetY,
        width: dragState.width,
        transform: 'rotate(1.5deg) scale(1.03)',
      }}
    >
      <div className="flex items-start gap-3">
        <DragIndicatorIcon className="card-drag-icon mt-0.5" fontSize="small" />
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-black leading-5">{card.title || 'Sem titulo'}</h3>
          {card.description ? (
            <p className="muted-text mt-2 line-clamp-2 break-words text-sm leading-5">
              {card.description}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="pill inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold">
              <FlagOutlinedIcon fontSize="inherit" />
              {card.priority}
            </span>
            {card.assignee ? (
              <span className="assignee-pill rounded-md px-2 py-1 text-xs font-bold">
                {card.assignee}
              </span>
            ) : null}
            {card.images.length > 0 ? (
              <span className="image-pill inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold">
                <ImageOutlinedIcon fontSize="inherit" />
                {card.images.length}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function TaskDialog({
  activeColumn,
  columns,
  draft,
  onClose,
  onDraftChange,
  onSetActiveColumn,
  onSubmit,
}: {
  activeColumn: ColumnId
  columns: Column[]
  draft: Draft
  onClose: () => void
  onDraftChange: (draft: Draft) => void
  onSetActiveColumn: (columnId: ColumnId) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <div className="dialog-backdrop fixed inset-0 z-40 grid place-items-center px-4 py-6">
      <form
        role="dialog"
        aria-modal="true"
        onSubmit={onSubmit}
        className="surface w-full max-w-[560px] rounded-xl p-4 md:p-5"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-black">Nova tarefa</h2>
          <Tooltip title="Fechar">
            <button
              type="button"
              onClick={onClose}
              className="mini-icon-button grid size-9 place-items-center rounded-lg"
            >
              <CloseIcon fontSize="small" />
            </button>
          </Tooltip>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="label-text mb-1 block text-xs font-bold uppercase">Coluna</span>
            <select
              value={activeColumn}
              onChange={(event) => onSetActiveColumn(event.target.value)}
              className="field h-11 w-full rounded-lg px-3 text-sm"
            >
              {columns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.title || 'Sem nome'}
                </option>
              ))}
            </select>
          </label>

          <input
            value={draft.title}
            onChange={(event) => onDraftChange({ ...draft, title: event.target.value })}
            placeholder="Titulo"
            className="field h-11 w-full rounded-lg px-3 text-sm"
            required
          />

          <textarea
            value={draft.description}
            onChange={(event) => onDraftChange({ ...draft, description: event.target.value })}
            placeholder="Notas"
            className="field min-h-28 w-full resize-none rounded-lg px-3 py-3 text-sm leading-5"
          />

          <input
            value={draft.assignee}
            onChange={(event) => onDraftChange({ ...draft, assignee: event.target.value })}
            placeholder="Responsavel"
            className="field h-11 w-full rounded-lg px-3 text-sm"
          />

          <PriorityPicker
            value={draft.priority}
            onChange={(priority) => onDraftChange({ ...draft, priority })}
          />

          <ImageEditor
            images={draft.images}
            mode="compact"
            onChange={(images) => onDraftChange({ ...draft, images })}
          />

          <button
            type="submit"
            className="primary-action flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-black"
          >
            <AddIcon fontSize="small" />
            Adicionar
          </button>
        </div>
      </form>
    </div>
  )
}

function TaskDetailView({
  card,
  columns,
  onBack,
  onDelete,
  onUpdate,
}: {
  card: Card
  columns: Column[]
  onBack: () => void
  onDelete: () => void
  onUpdate: (patch: Partial<Card>) => void
}) {
  return (
    <section className="w-full px-4 py-5 md:px-8">
      <div className="surface rounded-xl p-4 md:p-6">
        <div className="mb-5 flex flex-col gap-3 border-b border-[color:var(--border)] pb-5 md:flex-row md:items-center md:justify-between">
          <button
            type="button"
            onClick={onBack}
            className="ghost-action inline-flex h-10 w-fit items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold"
          >
            <ArrowBackIcon fontSize="small" />
            Quadro
          </button>

          <button
            type="button"
            onClick={onDelete}
            className="danger-action inline-flex h-10 w-fit items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold"
          >
            <DeleteOutlineIcon fontSize="small" />
            Excluir tarefa
          </button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <label className="block">
              <span className="label-text mb-2 block text-xs font-bold uppercase">Titulo</span>
              <input
                value={card.title}
                onChange={(event) => onUpdate({ title: event.target.value })}
                className="field min-h-14 w-full rounded-lg px-4 text-2xl font-black"
              />
            </label>

            <label className="block">
              <span className="label-text mb-2 block text-xs font-bold uppercase">Notas</span>
              <textarea
                value={card.description}
                onChange={(event) => onUpdate({ description: event.target.value })}
                className="field min-h-[320px] w-full resize-y rounded-lg px-4 py-4 text-sm leading-6"
                placeholder="Detalhes da tarefa"
              />
            </label>

            <ImageEditor
              images={card.images}
              mode="detail"
              onChange={(images) => onUpdate({ images })}
            />
          </div>

          <aside className="surface-soft space-y-4 rounded-xl p-4">
            <label className="block">
              <span className="label-text mb-2 block text-xs font-bold uppercase">Coluna</span>
              <select
                value={card.columnId}
                onChange={(event) => onUpdate({ columnId: event.target.value })}
                className="field h-11 w-full rounded-lg px-3 text-sm"
              >
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.title || 'Sem nome'}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="label-text mb-2 block text-xs font-bold uppercase">Responsavel</span>
              <input
                value={card.assignee}
                onChange={(event) => onUpdate({ assignee: event.target.value })}
                className="field h-11 w-full rounded-lg px-3 text-sm"
                placeholder="Nome"
              />
            </label>

            <div>
              <span className="label-text mb-2 block text-xs font-bold uppercase">Prioridade</span>
              <PriorityPicker value={card.priority} onChange={(priority) => onUpdate({ priority })} />
            </div>

            <div className="soft-box rounded-lg px-3 py-3">
              <div className="label-text text-xs font-bold uppercase">Criada em</div>
              <div className="mt-1 text-sm font-bold">
                {new Date(card.createdAt).toLocaleString('pt-BR')}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}

function SettingsView({
  cards,
  columns,
  newColumnTitle,
  onAddColumn,
  onDeleteColumn,
  onNewColumnTitleChange,
  onRenameColumn,
  onReorderColumns,
  onReturn,
  onThemeChange,
  theme,
}: {
  cards: Card[]
  columns: Column[]
  newColumnTitle: string
  onAddColumn: (event: FormEvent<HTMLFormElement>) => void
  onDeleteColumn: (columnId: ColumnId) => void
  onNewColumnTitleChange: (title: string) => void
  onRenameColumn: (columnId: ColumnId, title: string) => void
  onReorderColumns: (sourceId: ColumnId, targetId: ColumnId) => void
  onReturn: () => void
  onThemeChange: (theme: ThemeMode) => void
  theme: ThemeMode
}) {
  const [draggedColumnId, setDraggedColumnId] = useState<ColumnId | null>(null)
  const [dropColumnId, setDropColumnId] = useState<ColumnId | null>(null)

  function handleColumnDragStart(event: DragEvent<HTMLElement>, columnId: ColumnId) {
    setDraggedColumnId(columnId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', columnId)
  }

  function handleColumnDragOver(event: DragEvent<HTMLDivElement>, columnId: ColumnId) {
    if (!draggedColumnId || draggedColumnId === columnId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropColumnId(columnId)
  }

  function handleColumnDrop(event: DragEvent<HTMLDivElement>, targetId: ColumnId) {
    event.preventDefault()
    const sourceId = event.dataTransfer.getData('text/plain') || draggedColumnId
    if (sourceId) onReorderColumns(sourceId, targetId)
    setDraggedColumnId(null)
    setDropColumnId(null)
  }

  function clearColumnDrag() {
    setDraggedColumnId(null)
    setDropColumnId(null)
  }

  return (
    <section className="w-full px-4 py-5 md:px-8">
      <div className="grid w-full gap-5 xl:grid-cols-[360px_1fr]">
        <div className="surface rounded-xl p-4 md:p-5">
          <div className="flex flex-col gap-3 border-b border-[color:var(--border)] pb-4">
            <div>
              <h2 className="text-lg font-black">Configuracoes</h2>
              <p className="muted-text mt-1 text-sm">Tema, criacao e colunas do quadro</p>
            </div>
            <button
              type="button"
              onClick={onReturn}
              className="ghost-action inline-flex h-10 w-fit items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold"
            >
              <ViewKanbanOutlinedIcon fontSize="small" />
              Quadro
            </button>
          </div>

          <div className="mt-5">
            <div className="mb-3 flex items-center gap-2">
              <PaletteOutlinedIcon className="accent-text" fontSize="small" />
              <h3 className="text-sm font-black uppercase">Tema</h3>
            </div>

            <div className="grid gap-2">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onThemeChange(option.value)}
                  className={`theme-button rounded-xl p-3 text-left ${
                    theme === option.value ? 'theme-button--active' : ''
                  }`}
                >
                  <span className="block text-sm font-black">{option.label}</span>
                  <span className="mt-1 block text-xs font-bold">{option.description}</span>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={onAddColumn} className="mt-6 space-y-2">
            <label className="block">
              <span className="label-text mb-2 block text-xs font-bold uppercase">
                Nova coluna
              </span>
              <input
                value={newColumnTitle}
                onChange={(event) => onNewColumnTitleChange(event.target.value)}
                placeholder="Nome da nova coluna"
                className="field h-11 w-full rounded-lg px-3 text-sm"
                required
              />
            </label>
            <button
              type="submit"
              className="primary-action inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-black"
            >
              <AddIcon fontSize="small" />
              Criar coluna
            </button>
          </form>
        </div>

        <div className="surface rounded-xl p-4 md:p-5">
          <div className="mb-5 flex flex-col gap-2 border-b border-[color:var(--border)] pb-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-black">Colunas</h2>
              <p className="muted-text mt-1 text-sm">
                Arraste pelo puxador para reorganizar a ordem do quadro.
              </p>
            </div>
            <span className="soft-box rounded-lg px-3 py-2 text-xs font-bold">
              {columns.length} colunas
            </span>
          </div>

          <div className="space-y-3">
            {columns.map((column, index) => {
              const cardCount = cards.filter((card) => card.columnId === column.id).length
              const isDragging = draggedColumnId === column.id
              const isDropTarget = dropColumnId === column.id

              return (
                <div
                  key={column.id}
                  onDragOver={(event) => handleColumnDragOver(event, column.id)}
                  onDrop={(event) => handleColumnDrop(event, column.id)}
                  className={`column-row grid gap-3 rounded-xl p-3 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center ${
                    isDragging ? 'column-row--dragging' : ''
                  } ${isDropTarget ? 'column-row--drop' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="h-8 w-1 rounded-full" style={columnAccentStyle(index)} />
                    <span className="label-text text-xs font-black uppercase">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <Tooltip title="Arrastar coluna">
                      <span
                        role="button"
                        tabIndex={0}
                        draggable
                        onDragEnd={clearColumnDrag}
                        onDragStart={(event) => handleColumnDragStart(event, column.id)}
                        className="drag-handle grid size-9 place-items-center rounded-lg"
                        aria-label={`Reordenar ${column.title || 'coluna'}`}
                      >
                        <DragIndicatorIcon fontSize="small" />
                      </span>
                    </Tooltip>
                  </div>

                  <input
                    value={column.title}
                    onChange={(event) => onRenameColumn(column.id, event.target.value)}
                    placeholder="Nome da coluna"
                    className="field h-11 min-w-0 rounded-lg px-3 text-sm font-bold"
                  />

                  <div className="soft-box rounded-lg px-3 py-2 text-xs font-bold">
                    {cardCount} cards
                  </div>

                  <Tooltip title={columns.length <= 1 ? 'Mantenha ao menos uma coluna' : 'Excluir coluna'}>
                    <span>
                      <button
                        type="button"
                        onClick={() => onDeleteColumn(column.id)}
                        disabled={columns.length <= 1}
                        className="icon-button icon-button-danger grid size-11 place-items-center rounded-lg disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </button>
                    </span>
                  </Tooltip>
                </div>
              )
            })}
          </div>

          <p className="muted-text mt-4 text-sm">
            Ao excluir uma coluna, os cards dela vao para a primeira coluna disponivel.
          </p>
        </div>
      </div>
    </section>
  )
}

function ImageEditor({
  images,
  mode,
  onChange,
}: {
  images: TaskImage[]
  mode: 'compact' | 'detail'
  onChange: (images: TaskImage[]) => void
}) {
  const [message, setMessage] = useState('')
  const remainingSlots = MAX_IMAGES_PER_CARD - images.length

  async function handleFiles(event: FormEvent<HTMLInputElement>) {
    const input = event.currentTarget

    try {
      const result = await readImageFiles(input.files, remainingSlots)
      if (result.images.length > 0) {
        onChange([...images, ...result.images].slice(0, MAX_IMAGES_PER_CARD))
      }
      setMessage(result.message)
    } catch {
      setMessage('Nao consegui carregar essas imagens.')
    } finally {
      input.value = ''
    }
  }

  function removeImage(imageId: string) {
    onChange(images.filter((image) => image.id !== imageId))
    setMessage('')
  }

  return (
    <section className={`image-editor rounded-xl p-3 ${mode === 'detail' ? 'md:p-4' : ''}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ImageOutlinedIcon className="accent-text" fontSize="small" />
            <h3 className="text-sm font-black uppercase">Imagens</h3>
          </div>
          <p className="muted-text mt-1 text-xs font-bold">
            {images.length} de {MAX_IMAGES_PER_CARD} anexadas
          </p>
        </div>

        <input
          aria-label="Adicionar imagens"
          accept="image/*"
          className="file-input text-sm"
          disabled={remainingSlots <= 0}
          multiple
          onChange={handleFiles}
          type="file"
        />
      </div>

      {message ? <p className="image-message mt-3 text-xs font-bold">{message}</p> : null}

      {images.length > 0 ? (
        <div
          className={`mt-3 grid gap-3 ${
            mode === 'detail'
              ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
              : 'grid-cols-2'
          }`}
        >
          {images.map((image) => (
            <figure key={image.id} className="image-tile overflow-hidden rounded-xl">
              <img
                alt={image.name}
                className={`w-full object-cover ${mode === 'detail' ? 'h-56' : 'h-24'}`}
                src={image.dataUrl}
              />
              <figcaption className="flex items-center gap-2 p-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-black">{image.name}</div>
                  <div className="label-text text-[11px] font-bold">{formatBytes(image.size)}</div>
                </div>
                <Tooltip title="Remover imagem">
                  <button
                    type="button"
                    className="mini-icon-button mini-icon-button-danger grid size-8 place-items-center rounded-md"
                    onClick={() => removeImage(image.id)}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </button>
                </Tooltip>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="empty-image-box mt-3 rounded-xl px-3 py-6 text-center text-sm font-bold">
          Nenhuma imagem nesta tarefa.
        </div>
      )}
    </section>
  )
}

function PriorityPicker({
  value,
  onChange,
}: {
  value: Priority
  onChange: (priority: Priority) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {(['Baixa', 'Normal', 'Alta'] as Priority[]).map((priority) => (
        <button
          key={priority}
          type="button"
          onClick={() => onChange(priority)}
          className={`priority-button h-9 rounded-lg text-xs font-bold ${
            value === priority ? 'priority-button--active' : ''
          }`}
        >
          {priority}
        </button>
      ))}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-box h-11 rounded-xl px-3 py-1.5">
      <div className="label-text text-[10px] font-black uppercase tracking-normal">{label}</div>
      <div className="text-sm font-black">{value}</div>
    </div>
  )
}

export default App
