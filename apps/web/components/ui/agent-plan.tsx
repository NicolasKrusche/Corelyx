"use client";

import * as React from "react";
import {
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleDotDashed,
  CircleX,
} from "lucide-react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { cn } from "@/lib/utils";

export type PlanStatus =
  | "completed"
  | "in-progress"
  | "pending"
  | "need-help"
  | "failed"
  | "success"
  | "running"
  | "waiting_approval"
  | "cancelled"
  | "skipped"
  | string;

export interface PlanSubtask {
  id: string;
  title: string;
  description: string;
  status: PlanStatus;
  priority: string;
  tools?: string[];
}

export interface PlanTask {
  id: string;
  title: string;
  description: string;
  status: PlanStatus;
  priority: string;
  level: number;
  dependencies: string[];
  subtasks: PlanSubtask[];
}

interface AgentPlanProps {
  tasks?: PlanTask[];
  defaultExpandedTaskIds?: string[];
  interactive?: boolean;
  className?: string;
  emptyMessage?: string;
}

const initialTasks: PlanTask[] = [
  {
    id: "1",
    title: "Research Project Requirements",
    description:
      "Gather all necessary information about project scope and requirements",
    status: "in-progress",
    priority: "high",
    level: 0,
    dependencies: [],
    subtasks: [
      {
        id: "1.1",
        title: "Interview stakeholders",
        description:
          "Conduct interviews with key stakeholders to understand needs",
        status: "completed",
        priority: "high",
        tools: ["communication-agent", "meeting-scheduler"],
      },
      {
        id: "1.2",
        title: "Review existing documentation",
        description:
          "Go through all available documentation and extract requirements",
        status: "in-progress",
        priority: "medium",
        tools: ["file-system", "browser"],
      },
      {
        id: "1.3",
        title: "Compile findings report",
        description:
          "Create a comprehensive report of all gathered information",
        status: "need-help",
        priority: "medium",
        tools: ["file-system", "markdown-processor"],
      },
    ],
  },
  {
    id: "2",
    title: "Design System Architecture",
    description: "Create the overall system architecture based on requirements",
    status: "pending",
    priority: "high",
    level: 0,
    dependencies: [],
    subtasks: [
      {
        id: "2.1",
        title: "Define component structure",
        description: "Map out all required components and their interactions",
        status: "pending",
        priority: "high",
        tools: ["architecture-planner", "diagramming-tool"],
      },
      {
        id: "2.2",
        title: "Create data flow diagrams",
        description:
          "Design diagrams showing how data will flow through the system",
        status: "pending",
        priority: "medium",
        tools: ["diagramming-tool", "file-system"],
      },
    ],
  },
];

const STATUS_CYCLE: PlanStatus[] = [
  "pending",
  "in-progress",
  "need-help",
  "failed",
  "completed",
];

function normalizeStatus(status: PlanStatus): PlanStatus {
  if (status === "success") return "completed";
  if (status === "running") return "in-progress";
  if (status === "waiting_approval") return "need-help";
  if (status === "cancelled") return "failed";
  if (status === "skipped") return "pending";
  return status;
}

function statusLabel(status: PlanStatus) {
  return String(status).replace(/[_-]/g, " ");
}

function statusBadgeClasses(status: PlanStatus) {
  const normalized = normalizeStatus(status);
  if (normalized === "completed") {
    return "bg-green-500/15 text-green-700 dark:text-green-400";
  }
  if (normalized === "in-progress") {
    return "bg-blue-500/15 text-blue-700 dark:text-blue-400";
  }
  if (normalized === "need-help") {
    return "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400";
  }
  if (normalized === "failed") {
    return "bg-red-500/15 text-red-700 dark:text-red-400";
  }
  return "bg-muted text-muted-foreground";
}

function StatusIcon({
  status,
  className,
}: {
  status: PlanStatus;
  className?: string;
}) {
  const normalized = normalizeStatus(status);
  if (normalized === "completed") {
    return <CheckCircle2 className={cn("text-green-500", className)} />;
  }
  if (normalized === "in-progress") {
    return <CircleDotDashed className={cn("text-blue-500", className)} />;
  }
  if (normalized === "need-help") {
    return <CircleAlert className={cn("text-yellow-500", className)} />;
  }
  if (normalized === "failed") {
    return <CircleX className={cn("text-red-500", className)} />;
  }
  return <Circle className={cn("text-muted-foreground", className)} />;
}

function nextStatus(status: PlanStatus) {
  const normalized = normalizeStatus(status);
  const currentIndex = STATUS_CYCLE.indexOf(normalized);
  return STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length];
}

function getDefaultExpandedIds(tasks: PlanTask[]) {
  const active = tasks.find((task) =>
    ["in-progress", "need-help", "failed", "running", "waiting_approval"].includes(
      normalizeStatus(task.status)
    )
  );
  return [active?.id ?? tasks[0]?.id].filter(Boolean);
}

export default function Plan({
  tasks: providedTasks,
  defaultExpandedTaskIds,
  interactive,
  className,
  emptyMessage = "No plan steps available.",
}: AgentPlanProps) {
  const isControlled = providedTasks !== undefined;
  const [tasks, setTasks] = React.useState<PlanTask[]>(
    providedTasks ?? initialTasks
  );
  const [expandedTasks, setExpandedTasks] = React.useState<string[]>(
    defaultExpandedTaskIds ?? getDefaultExpandedIds(providedTasks ?? initialTasks)
  );
  const [expandedSubtasks, setExpandedSubtasks] = React.useState<
    Record<string, boolean>
  >({});
  const prefersReducedMotion = useReducedMotion();
  const canEditStatuses = interactive ?? !isControlled;

  React.useEffect(() => {
    if (providedTasks) {
      setTasks(providedTasks);
      setExpandedTasks((current) =>
        current.length > 0
          ? current.filter((id) => providedTasks.some((task) => task.id === id))
          : defaultExpandedTaskIds ?? getDefaultExpandedIds(providedTasks)
      );
    }
  }, [defaultExpandedTaskIds, providedTasks]);

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId]
    );
  };

  const toggleSubtaskExpansion = (taskId: string, subtaskId: string) => {
    const key = `${taskId}-${subtaskId}`;
    setExpandedSubtasks((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleTaskStatus = (taskId: string) => {
    if (!canEditStatuses) return;
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId) return task;

        const newStatus = nextStatus(task.status);
        const updatedSubtasks = task.subtasks.map((subtask) => ({
          ...subtask,
          status: newStatus === "completed" ? "completed" : subtask.status,
        }));

        return {
          ...task,
          status: newStatus,
          subtasks: updatedSubtasks,
        };
      })
    );
  };

  const toggleSubtaskStatus = (taskId: string, subtaskId: string) => {
    if (!canEditStatuses) return;
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId) return task;

        const updatedSubtasks = task.subtasks.map((subtask) => {
          if (subtask.id !== subtaskId) return subtask;
          const newStatus =
            normalizeStatus(subtask.status) === "completed"
              ? "pending"
              : "completed";
          return { ...subtask, status: newStatus };
        });
        const allSubtasksCompleted = updatedSubtasks.every(
          (subtask) => normalizeStatus(subtask.status) === "completed"
        );

        return {
          ...task,
          subtasks: updatedSubtasks,
          status: allSubtasksCompleted ? "completed" : task.status,
        };
      })
    );
  };

  const taskVariants: Variants = {
    hidden: {
      opacity: 0,
      y: prefersReducedMotion ? 0 : -5,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: prefersReducedMotion ? "tween" : "spring",
        stiffness: 500,
        damping: 30,
        duration: prefersReducedMotion ? 0.2 : undefined,
      },
    },
    exit: {
      opacity: 0,
      y: prefersReducedMotion ? 0 : -5,
      transition: { duration: 0.15 },
    },
  };

  const subtaskListVariants: Variants = {
    hidden: {
      opacity: 0,
      height: 0,
      overflow: "hidden",
    },
    visible: {
      height: "auto",
      opacity: 1,
      overflow: "visible",
      transition: {
        duration: 0.25,
        staggerChildren: prefersReducedMotion ? 0 : 0.05,
        when: "beforeChildren",
        ease: [0.2, 0.65, 0.3, 0.9],
      },
    },
    exit: {
      height: 0,
      opacity: 0,
      overflow: "hidden",
      transition: {
        duration: 0.2,
        ease: [0.2, 0.65, 0.3, 0.9],
      },
    },
  };

  const subtaskVariants: Variants = {
    hidden: {
      opacity: 0,
      x: prefersReducedMotion ? 0 : -10,
    },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        type: prefersReducedMotion ? "tween" : "spring",
        stiffness: 500,
        damping: 25,
        duration: prefersReducedMotion ? 0.2 : undefined,
      },
    },
    exit: {
      opacity: 0,
      x: prefersReducedMotion ? 0 : -10,
      transition: { duration: 0.15 },
    },
  };

  const subtaskDetailsVariants: Variants = {
    hidden: {
      opacity: 0,
      height: 0,
      overflow: "hidden",
    },
    visible: {
      opacity: 1,
      height: "auto",
      overflow: "visible",
      transition: {
        duration: 0.25,
        ease: [0.2, 0.65, 0.3, 0.9],
      },
    },
  };

  const statusBadgeVariants: Variants = {
    initial: { scale: 1 },
    animate: {
      scale: prefersReducedMotion ? 1 : [1, 1.08, 1],
      transition: {
        duration: 0.35,
        ease: [0.34, 1.56, 0.64, 1],
      },
    },
  };

  return (
    <div className={cn("bg-background text-foreground h-full overflow-auto p-2", className)}>
      <motion.div
        className="bg-card border-border overflow-hidden rounded-lg border shadow"
        initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 10 }}
        animate={{
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.3,
            ease: [0.2, 0.65, 0.3, 0.9],
          },
        }}
      >
        <LayoutGroup>
          <div className="overflow-hidden p-4">
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            ) : (
              <ul className="space-y-1 overflow-hidden">
                {tasks.map((task, index) => {
                  const isExpanded = expandedTasks.includes(task.id);
                  const isCompleted =
                    normalizeStatus(task.status) === "completed";

                  return (
                    <motion.li
                      key={task.id}
                      className={cn(index !== 0 && "mt-1 pt-2")}
                      initial="hidden"
                      animate="visible"
                      variants={taskVariants}
                    >
                      <motion.div
                        className="group flex items-center rounded-md px-3 py-1.5 hover:bg-accent/40"
                        whileHover={{ y: prefersReducedMotion ? 0 : -1 }}
                      >
                        <motion.button
                          type="button"
                          className={cn(
                            "mr-2 flex shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            canEditStatuses ? "cursor-pointer" : "cursor-default"
                          )}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleTaskStatus(task.id);
                          }}
                          aria-label={`${canEditStatuses ? "Change" : "View"} ${task.title} status`}
                          whileTap={canEditStatuses ? { scale: 0.9 } : undefined}
                          whileHover={canEditStatuses ? { scale: 1.1 } : undefined}
                        >
                          <AnimatePresence mode="wait">
                            <motion.span
                              key={task.status}
                              initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
                              animate={{ opacity: 1, scale: 1, rotate: 0 }}
                              exit={{ opacity: 0, scale: 0.8, rotate: 10 }}
                              transition={{
                                duration: 0.2,
                                ease: [0.2, 0.65, 0.3, 0.9],
                              }}
                            >
                              <StatusIcon
                                status={task.status}
                                className="h-[18px] w-[18px]"
                              />
                            </motion.span>
                          </AnimatePresence>
                        </motion.button>

                        <button
                          type="button"
                          className="flex min-w-0 flex-grow cursor-pointer items-center justify-between rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => toggleTaskExpansion(task.id)}
                          aria-expanded={isExpanded}
                        >
                          <span className="mr-2 min-w-0 flex-1 truncate">
                            <span
                              className={cn(
                                isCompleted &&
                                  "text-muted-foreground line-through"
                              )}
                            >
                              {task.title}
                            </span>
                          </span>

                          <span className="flex shrink-0 items-center space-x-2 text-xs">
                            {task.dependencies.length > 0 && (
                              <span className="mr-2 flex items-center">
                                <span className="flex flex-wrap gap-1">
                                  {task.dependencies.map((dep, idx) => (
                                    <motion.span
                                      key={`${task.id}-${dep}`}
                                      className="bg-secondary/60 text-secondary-foreground rounded px-1.5 py-0.5 text-[10px] font-medium shadow-sm"
                                      initial={{ opacity: 0, scale: 0.9 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      transition={{
                                        duration: 0.2,
                                        delay: idx * 0.05,
                                      }}
                                      whileHover={{
                                        y: prefersReducedMotion ? 0 : -1,
                                      }}
                                    >
                                      {dep}
                                    </motion.span>
                                  ))}
                                </span>
                              </span>
                            )}

                            <motion.span
                              className={cn(
                                "rounded px-1.5 py-0.5 capitalize",
                                statusBadgeClasses(task.status)
                              )}
                              variants={statusBadgeVariants}
                              initial="initial"
                              animate="animate"
                              key={task.status}
                            >
                              {statusLabel(task.status)}
                            </motion.span>
                          </span>
                        </button>
                      </motion.div>

                      <AnimatePresence mode="wait">
                        {isExpanded && task.subtasks.length > 0 && (
                          <motion.div
                            className="relative overflow-hidden"
                            variants={subtaskListVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            layout
                          >
                            <div className="absolute bottom-0 left-[20px] top-0 border-l-2 border-dashed border-muted-foreground/30" />
                            <ul className="border-muted mb-1.5 ml-3 mr-2 mt-1 space-y-0.5">
                              {task.subtasks.map((subtask) => {
                                const subtaskKey = `${task.id}-${subtask.id}`;
                                const isSubtaskExpanded =
                                  expandedSubtasks[subtaskKey];
                                const isSubtaskCompleted =
                                  normalizeStatus(subtask.status) ===
                                  "completed";

                                return (
                                  <motion.li
                                    key={subtask.id}
                                    className="group flex flex-col py-0.5 pl-6"
                                    variants={subtaskVariants}
                                    initial="hidden"
                                    animate="visible"
                                    exit="exit"
                                    layout
                                  >
                                    <motion.div
                                      className="flex flex-1 items-center rounded-md p-1 hover:bg-accent/40"
                                      whileHover={{
                                        y: prefersReducedMotion ? 0 : -1,
                                      }}
                                      layout
                                    >
                                      <motion.button
                                        type="button"
                                        className={cn(
                                          "mr-2 flex shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                          canEditStatuses
                                            ? "cursor-pointer"
                                            : "cursor-default"
                                        )}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          toggleSubtaskStatus(
                                            task.id,
                                            subtask.id
                                          );
                                        }}
                                        aria-label={`${canEditStatuses ? "Change" : "View"} ${subtask.title} status`}
                                        whileTap={
                                          canEditStatuses
                                            ? { scale: 0.9 }
                                            : undefined
                                        }
                                        whileHover={
                                          canEditStatuses
                                            ? { scale: 1.1 }
                                            : undefined
                                        }
                                        layout
                                      >
                                        <AnimatePresence mode="wait">
                                          <motion.span
                                            key={subtask.status}
                                            initial={{
                                              opacity: 0,
                                              scale: 0.8,
                                              rotate: -10,
                                            }}
                                            animate={{
                                              opacity: 1,
                                              scale: 1,
                                              rotate: 0,
                                            }}
                                            exit={{
                                              opacity: 0,
                                              scale: 0.8,
                                              rotate: 10,
                                            }}
                                            transition={{
                                              duration: 0.2,
                                              ease: [0.2, 0.65, 0.3, 0.9],
                                            }}
                                          >
                                            <StatusIcon
                                              status={subtask.status}
                                              className="h-3.5 w-3.5"
                                            />
                                          </motion.span>
                                        </AnimatePresence>
                                      </motion.button>

                                      <button
                                        type="button"
                                        className={cn(
                                          "min-w-0 flex-1 cursor-pointer rounded-sm text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                          isSubtaskCompleted &&
                                            "text-muted-foreground line-through"
                                        )}
                                        onClick={() =>
                                          toggleSubtaskExpansion(
                                            task.id,
                                            subtask.id
                                          )
                                        }
                                        aria-expanded={isSubtaskExpanded}
                                      >
                                        <span className="block truncate">
                                          {subtask.title}
                                        </span>
                                      </button>
                                    </motion.div>

                                    <AnimatePresence mode="wait">
                                      {isSubtaskExpanded && (
                                        <motion.div
                                          className="text-muted-foreground border-foreground/20 ml-1.5 mt-1 overflow-hidden border-l border-dashed pl-5 text-xs"
                                          variants={subtaskDetailsVariants}
                                          initial="hidden"
                                          animate="visible"
                                          exit="hidden"
                                          layout
                                        >
                                          <p className="py-1">
                                            {subtask.description}
                                          </p>
                                          {subtask.tools &&
                                            subtask.tools.length > 0 && (
                                              <div className="mb-1 mt-0.5 flex flex-wrap items-center gap-1.5">
                                                <span className="text-muted-foreground font-medium">
                                                  Tools:
                                                </span>
                                                <div className="flex flex-wrap gap-1">
                                                  {subtask.tools.map(
                                                    (tool, idx) => (
                                                      <motion.span
                                                        key={`${subtask.id}-${tool}`}
                                                        className="bg-secondary/60 text-secondary-foreground rounded px-1.5 py-0.5 text-[10px] font-medium shadow-sm"
                                                        initial={{
                                                          opacity: 0,
                                                          y: -5,
                                                        }}
                                                        animate={{
                                                          opacity: 1,
                                                          y: 0,
                                                          transition: {
                                                            duration: 0.2,
                                                            delay: idx * 0.05,
                                                          },
                                                        }}
                                                        whileHover={{
                                                          y: prefersReducedMotion
                                                            ? 0
                                                            : -1,
                                                        }}
                                                      >
                                                        {tool}
                                                      </motion.span>
                                                    )
                                                  )}
                                                </div>
                                              </div>
                                            )}
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </motion.li>
                                );
                              })}
                            </ul>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </div>
        </LayoutGroup>
      </motion.div>
    </div>
  );
}
