import { useState } from 'react';
import clsx from 'clsx';
import type { DragEvent, ReactNode } from 'react';
import WidgetTile from './WidgetTile';

/*
 * NOTE: For production we standardise on `react-grid-layout` for true
 * responsive drag/resize with persisted layouts. This component provides a
 * dependency-free HTML5 drag-and-drop fallback suitable for prototypes and
 * environments where react-grid-layout is not yet wired up.
 */

export interface WidgetDescriptor {
  id: string;
  title: string;
  size?: 'sm' | 'md' | 'lg';
  locked?: boolean;
  [key: string]: unknown;
}

/**
 * WidgetGrid arranges WidgetTile children in a responsive CSS grid and supports
 * reordering via native HTML5 drag-and-drop.
 *
 * @param widgets Ordered list of widget descriptors to render.
 * @param onLayoutChange Called with the reordered descriptors after a drop.
 * @param editable When true shows dashed drop zones and enables dragging.
 * @param renderWidget Optional render prop to render a widget's body content.
 * @param children Optional static children rendered instead of the render prop.
 */
export interface WidgetGridProps {
  widgets: WidgetDescriptor[];
  onLayoutChange?: (widgets: WidgetDescriptor[]) => void;
  editable?: boolean;
  renderWidget?: (widget: WidgetDescriptor) => ReactNode;
  children?: ReactNode;
}

const WidgetGrid = ({
  widgets,
  onLayoutChange,
  editable = false,
  renderWidget,
  children,
}: WidgetGridProps) => {
  const [items, setItems] = useState<WidgetDescriptor[]>(widgets);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => (event: DragEvent) => {
    setDragIndex(index);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (index: number) => (event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setOverIndex(index);
  };

  const handleDrop = (index: number) => (event: DragEvent) => {
    event.preventDefault();
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    setItems(next);
    setDragIndex(null);
    setOverIndex(null);
    onLayoutChange?.(next);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {items.map((widget, index) => (
        <div
          key={widget.id}
          draggable={editable && !widget.locked}
          onDragStart={handleDragStart(index)}
          onDragOver={handleDragOver(index)}
          onDrop={handleDrop(index)}
          onDragEnd={handleDragEnd}
          className={clsx(
            widget.size === 'lg' ? 'md:col-span-2' : 'col-span-1',
            'transition-colors duration-200',
            editable && 'rounded-2xl',
            editable && overIndex === index && 'ring-2 ring-primary/40 ring-offset-2 ring-offset-background',
            editable && 'border-2 border-dashed border-outline/30',
            dragIndex === index && 'opacity-60',
          )}
        >
          <WidgetTile
            id={widget.id}
            title={widget.title}
            size={widget.size}
            locked={widget.locked}
          >
            {renderWidget ? renderWidget(widget) : children}
          </WidgetTile>
        </div>
      ))}
    </div>
  );
};

export default WidgetGrid;
