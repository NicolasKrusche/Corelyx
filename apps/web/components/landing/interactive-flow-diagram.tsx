"use client";

import { useCallback, useRef, useState } from "react";

type NodeData = {
  id: string;
  type: "trigger" | "agent" | "step";
  label: string;
  subtitle: string;
  x: number;
  y: number;
  w: number;
};

const H = 78;

const COLORS = {
  trigger: { stroke: "#f97316", fill: "#0d0d0d",  text: "#f97316", header: "rgba(249,115,22,0.08)" },
  agent:   { stroke: "#a855f7", fill: "#0d0a12",  text: "#a855f7", header: "rgba(168,85,247,0.10)" },
  step:    { stroke: "#10b981", fill: "#0a0f0d",  text: "#10b981", header: "rgba(16,185,129,0.08)" },
};

const TYPE_LABELS = { trigger: "TRIGGER", agent: "AGENT", step: "STEP" };

const INITIAL: NodeData[] = [
  { id: "trigger", type: "trigger", label: "New Email Received", subtitle: "via Gmail · unread",          x: 28,  y: 90, w: 177 },
  { id: "agent",   type: "agent",   label: "AI Summarizer",       subtitle: "GPT-4o · 3 tools assigned",  x: 248, y: 90, w: 167 },
  { id: "step",    type: "step",    label: "Save to Notion",       subtitle: "append_to_page · inbox",     x: 458, y: 90, w: 167 },
];

const EDGES = [
  { from: "trigger", to: "agent",  color: "#f97316", markerId: "arr-o" },
  { from: "agent",   to: "step",   color: "#a855f7", markerId: "arr-p" },
];

function toSvgCoords(svg: SVGSVGElement, e: MouseEvent) {
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  return {
    x: ((e.clientX - rect.left) / rect.width)  * vb.width,
    y: ((e.clientY - rect.top)  / rect.height) * vb.height,
  };
}

export function InteractiveFlowDiagram() {
  const [nodes, setNodes] = useState<NodeData[]>(INITIAL);
  const [hovered, setHovered] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; ox: number; oy: number } | null>(null);

  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));

  const onMouseDown = useCallback((id: string, e: React.MouseEvent<SVGGElement>) => {
    e.preventDefault();
    if (!svgRef.current) return;
    const { x, y } = toSvgCoords(svgRef.current, e.nativeEvent);
    const node = nodes.find((n) => n.id === id)!;
    drag.current = { id, ox: x - node.x, oy: y - node.y };
  }, [nodes]);

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drag.current || !svgRef.current) return;
    const { x, y } = toSvgCoords(svgRef.current, e.nativeEvent);
    const { id, ox, oy } = drag.current;
    setNodes((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, x: Math.max(0, Math.min(660 - n.w, x - ox)), y: Math.max(0, Math.min(220 - H, y - oy)) }
          : n
      )
    );
  }, []);

  const onMouseUp = useCallback(() => { drag.current = null; }, []);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 660 220"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full select-none"
      aria-label="Interactive agent pipeline diagram"
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{ cursor: drag.current ? "grabbing" : "default" }}
    >
      <defs>
        <pattern id="fd-dots" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#ffffff" fillOpacity="0.04" />
        </pattern>
        {[
          { id: "arr-o", color: "#f97316" },
          { id: "arr-p", color: "#a855f7" },
        ].map(({ id, color }) => (
          <marker key={id} id={id} markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
            <path d="M0,1 L0,6 L6,3.5 z" fill={color} fillOpacity="0.6" />
          </marker>
        ))}
        {Object.entries(COLORS).map(([type, c]) => (
          <filter key={type} id={`glow-${type}`} x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation={type === "agent" ? "5" : "3"} result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        ))}
      </defs>

      {/* Background */}
      <rect width="660" height="220" rx="12" fill="#080808" />
      <rect width="660" height="220" rx="12" fill="url(#fd-dots)" />

      {/* Title bar */}
      <rect width="660" height="32" rx="12" fill="#111111" />
      <rect y="12" width="660" height="20" fill="#111111" />
      <circle cx="18" cy="16" r="4" fill="#2a2a2a" />
      <circle cx="32" cy="16" r="4" fill="#2a2a2a" />
      <circle cx="46" cy="16" r="4" fill="#2a2a2a" />
      <text x="330" y="21" fontSize="9" fill="#444" textAnchor="middle" fontFamily="system-ui">
        Programs / Email Summary / editor
      </text>

      {/* Edges */}
      {EDGES.map(({ from, to, color, markerId }) => {
        const f = nodeMap[from];
        const t = nodeMap[to];
        if (!f || !t) return null;
        const x1 = f.x + f.w;
        const y1 = f.y + H / 2;
        const x2 = t.x;
        const y2 = t.y + H / 2;
        const mid = (x1 + x2) / 2;
        return (
          <path
            key={`${from}-${to}`}
            d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
            stroke={color}
            strokeWidth="1.5"
            strokeOpacity="0.55"
            strokeDasharray="5,3"
            fill="none"
            markerEnd={`url(#${markerId})`}
            className="edge-animate"
          />
        );
      })}

      {/* Nodes */}
      {nodes.map((node) => {
        const c = COLORS[node.type];
        const isHovered = hovered === node.id;
        const opacity = isHovered ? 1 : 0.85;
        const strokeOpacity = isHovered ? 1 : node.type === "step" ? 0.65 : 0.75;
        const strokeWidth = isHovered ? 1.75 : 1.25;
        return (
          <g
            key={node.id}
            filter={node.type !== "step" ? `url(#glow-${node.type})` : undefined}
            style={{ cursor: "grab", opacity }}
            onMouseDown={(e) => onMouseDown(node.id, e)}
            onMouseEnter={() => setHovered(node.id)}
            onMouseLeave={() => setHovered(null)}
          >
            <rect
              x={node.x} y={node.y}
              width={node.w} height={H}
              rx="8"
              fill={c.fill}
              stroke={c.stroke}
              strokeWidth={strokeWidth}
              strokeOpacity={strokeOpacity}
            />
            <rect x={node.x} y={node.y} width={node.w} height={14} rx="8" fill={c.header} />
            <rect x={node.x} y={node.y + 8} width={node.w} height={6} fill={c.header} />
            <text
              x={node.x + 12} y={node.y + 13}
              fontSize="7.5" fill={c.text}
              fontFamily="monospace" fontWeight="700" letterSpacing="1.5"
            >
              {TYPE_LABELS[node.type]}
            </text>
            <text
              x={node.x + 12} y={node.y + 36}
              fontSize="11.5" fill="#f0f0f0"
              fontWeight="600" fontFamily="system-ui"
            >
              {node.label}
            </text>
            <text
              x={node.x + 12} y={node.y + 54}
              fontSize="9" fill="#555" fontFamily="system-ui"
            >
              {node.subtitle}
            </text>
            {/* Left port */}
            {node.type !== "trigger" && (
              <circle cx={node.x} cy={node.y + H / 2} r="3.5" fill={c.stroke} fillOpacity="0.8" />
            )}
            {/* Right port */}
            {node.type !== "step" && (
              <circle cx={node.x + node.w} cy={node.y + H / 2} r="3.5" fill={c.stroke} fillOpacity="0.8" />
            )}
          </g>
        );
      })}

      {/* Running badge */}
      <rect x="558" y="192" width="84" height="18" rx="9" fill="#10b981" fillOpacity="0.12" />
      <circle cx="570" cy="201" r="3" fill="#10b981" fillOpacity="0.9" />
      <text x="577" y="205" fontSize="8.5" fill="#10b981" fontFamily="system-ui" fontWeight="500">
        Running…
      </text>
    </svg>
  );
}
