{{/*
Expand the name of the chart.
*/}}
{{- define "corelyx.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "corelyx.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "corelyx.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "corelyx.labels" -}}
helm.sh/chart: {{ include "corelyx.chart" . }}
{{ include "corelyx.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels for web
*/}}
{{- define "corelyx.web.selectorLabels" -}}
app.kubernetes.io/name: {{ include "corelyx.name" . }}-web
app.kubernetes.io/instance: {{ .Release.Name }}-web
{{- end }}

{{/*
Selector labels for runtime
*/}}
{{- define "corelyx.runtime.selectorLabels" -}}
app.kubernetes.io/name: {{ include "corelyx.name" . }}-runtime
app.kubernetes.io/instance: {{ .Release.Name }}-runtime
{{- end }}

{{/*
Selector labels (generic)
*/}}
{{- define "corelyx.selectorLabels" -}}
app.kubernetes.io/name: {{ include "corelyx.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Service account name
*/}}
{{- define "corelyx.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "corelyx.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}
