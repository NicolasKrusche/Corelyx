"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TemplateCard, type Difficulty } from "./TemplateCard";

type Category = {
  id: string;
  label: string;
  icon: string;
  description: string;
};

const CATEGORIES: Category[] = [
  { id: "ecommerce", label: "E-Commerce", icon: "🛒", description: "Bestellungen, Versand, Inventar" },
  { id: "devops", label: "DevOps", icon: "🛠️", description: "CI/CD, Issues, Deployments" },
  { id: "marketing", label: "Marketing", icon: "📣", description: "Social Media, Campaigns, Leads" },
  { id: "sales", label: "Sales", icon: "💰", description: "CRM, Pipeline, Rechnungen" },
  { id: "general", label: "Allgemein", icon: "⚡", description: "Tägliche Automationen, Berichte" },
];

type QuizTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: Difficulty;
  estimated_runtime: string;
  required_connections: string[];
  tags: string[];
};

// Curated recommendation per category
const RECOMMENDATIONS: Record<string, QuizTemplate[]> = {
  ecommerce: [
    {
      id: "form-submission-crm-lead",
      name: "Formular → CRM Lead",
      description: "Webformular-Einreichung automatisch als Lead in dein CRM eintragen.",
      category: "ecommerce",
      difficulty: "easy",
      estimated_runtime: "< 1 Min",
      required_connections: ["HTTP", "CRM"],
      tags: ["form", "crm", "lead"],
    },
    {
      id: "invoice-processing",
      name: "Rechnungsverarbeitung",
      description: "Eingehende Rechnungen parsen, validieren und im System erfassen.",
      category: "ecommerce",
      difficulty: "medium",
      estimated_runtime: "~ 2 Min",
      required_connections: ["Gmail", "HTTP"],
      tags: ["invoice", "finance", "automation"],
    },
    {
      id: "social-media-monitor",
      name: "Social Media Monitor",
      description: "Erwähnungen und Engagement auf Social Media automatisch tracken.",
      category: "ecommerce",
      difficulty: "easy",
      estimated_runtime: "< 1 Min",
      required_connections: ["HTTP", "Slack"],
      tags: ["social", "monitoring", "marketing"],
    },
  ],
  devops: [
    {
      id: "github-issue-notion",
      name: "GitHub Issue → Notion Page",
      description: "Neue GitHub Issues automatisch als Notion-Seiten anlegen.",
      category: "devops",
      difficulty: "easy",
      estimated_runtime: "< 1 Min",
      required_connections: ["GitHub", "Notion"],
      tags: ["github", "notion", "issues"],
    },
    {
      id: "github-pr-review",
      name: "GitHub PR Review",
      description: "Pull Requests automatisch reviewen und Feedback posten.",
      category: "devops",
      difficulty: "medium",
      estimated_runtime: "~ 3 Min",
      required_connections: ["GitHub"],
      tags: ["github", "pr", "review"],
    },
    {
      id: "api-health-check",
      name: "API Health Check",
      description: "Regelmäßig API-Endpunkte prüfen und bei Problemen benachrichtigen.",
      category: "devops",
      difficulty: "easy",
      estimated_runtime: "< 1 Min",
      required_connections: ["HTTP", "Slack"],
      tags: ["api", "health", "monitoring"],
    },
  ],
  marketing: [
    {
      id: "social-media-monitor",
      name: "Social Media Monitor",
      description: "Erwähnungen und Engagement auf Social Media automatisch tracken.",
      category: "marketing",
      difficulty: "easy",
      estimated_runtime: "< 1 Min",
      required_connections: ["HTTP", "Slack"],
      tags: ["social", "monitoring", "marketing"],
    },
    {
      id: "form-submission-crm-lead",
      name: "Formular → CRM Lead",
      description: "Webformular-Einreichung automatisch als Lead in dein CRM eintragen.",
      category: "marketing",
      difficulty: "easy",
      estimated_runtime: "< 1 Min",
      required_connections: ["HTTP", "CRM"],
      tags: ["form", "crm", "lead"],
    },
    {
      id: "weekly-report",
      name: "Wöchentlicher Bericht",
      description: "Automatisch einen Wochenbericht aus Datenquellen zusammenstellen.",
      category: "marketing",
      difficulty: "medium",
      estimated_runtime: "~ 2 Min",
      required_connections: ["Gmail", "Slack"],
      tags: ["report", "weekly", "analytics"],
    },
  ],
  sales: [
    {
      id: "form-submission-crm-lead",
      name: "Formular → CRM Lead",
      description: "Webformular-Einreichung automatisch als Lead in dein CRM eintragen.",
      category: "sales",
      difficulty: "easy",
      estimated_runtime: "< 1 Min",
      required_connections: ["HTTP", "CRM"],
      tags: ["form", "crm", "lead"],
    },
    {
      id: "invoice-processing",
      name: "Rechnungsverarbeitung",
      description: "Eingehende Rechnungen parsen, validieren und im System erfassen.",
      category: "sales",
      difficulty: "medium",
      estimated_runtime: "~ 2 Min",
      required_connections: ["Gmail", "HTTP"],
      tags: ["invoice", "finance", "automation"],
    },
    {
      id: "meeting-notes-task",
      name: "Meeting Notes → Tasks",
      description: "Meeting-Notizen in aufgabenbasierte Einträge umwandeln.",
      category: "sales",
      difficulty: "easy",
      estimated_runtime: "< 1 Min",
      required_connections: ["Notion"],
      tags: ["meeting", "tasks", "notes"],
    },
  ],
  general: [
    {
      id: "email-slack-summary",
      name: "E-Mail → Slack Zusammenfassung",
      description: "Eingehende E-Mails per KI zusammenfassen und in Slack posten.",
      category: "general",
      difficulty: "easy",
      estimated_runtime: "< 1 Min",
      required_connections: ["Gmail", "Slack"],
      tags: ["email", "slack", "ai"],
    },
    {
      id: "daily-digest",
      name: "Täglicher Digest",
      description: "Tägliche Zusammenfassung deiner wichtigsten Aktivitäten.",
      category: "general",
      difficulty: "easy",
      estimated_runtime: "< 1 Min",
      required_connections: ["Gmail"],
      tags: ["daily", "digest", "summary"],
    },
    {
      id: "weekly-report",
      name: "Wöchentlicher Bericht",
      description: "Automatisch einen Wochenbericht aus Datenquellen zusammenstellen.",
      category: "general",
      difficulty: "medium",
      estimated_runtime: "~ 2 Min",
      required_connections: ["Gmail", "Slack"],
      tags: ["report", "weekly", "analytics"],
    },
  ],
};

type Step = "choose" | "results";

export function OnboardingQuiz() {
  const [step, setStep] = useState<Step>("choose");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [results, setResults] = useState<QuizTemplate[]>([]);

  function handleCategorySelect(categoryId: string) {
    setSelectedCategory(categoryId);
    setResults(RECOMMENDATIONS[categoryId] ?? []);
    setStep("results");
  }

  function handleReset() {
    setStep("choose");
    setSelectedCategory(null);
    setResults([]);
  }

  if (step === "results" && results.length > 0) {
    const category = CATEGORIES.find((c) => c.id === selectedCategory);
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              {category?.icon} Empfohlen für {category?.label}
            </h2>
            <p className="text-sm text-muted-foreground">
              {category?.description}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleReset}>
            ← Zurück
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {results.map((tpl) => (
            <TemplateCard key={tpl.id} template={tpl} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          ⚡ Was für Workflows brauchst du?
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Wähle deine Branche — wir zeigen dir die besten Vorlagen.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategorySelect(cat.id)}
              className="flex flex-col items-center gap-2 rounded-lg border border-border bg-background p-4 text-center transition-colors hover:border-primary hover:bg-accent"
            >
              <span className="text-2xl">{cat.icon}</span>
              <span className="text-sm font-medium">{cat.label}</span>
              <span className="text-xs text-muted-foreground">{cat.description}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
