import api from '../api/client.js';

// Builds the reports endpoint path for a given type/params.
export function reportPath(kind, type, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') query.append(k, v);
  });
  const qs = query.toString();
  const base =
    type === 'school'
      ? `/reports/${kind}/school/${params.id}`
      : `/reports/${kind}/${type}`;
  if (type === 'school') {
    return base;
  }
  return qs ? `${base}?${qs}` : base;
}

export async function fetchReportBlob(kind, type, params = {}) {
  const path = reportPath(kind, type, params);
  const res = await api.get(path, { responseType: 'blob', timeout: 60000 });
  return new Blob([res.data], {
    type: kind === 'pdf' ? 'application/pdf' : 'text/csv',
  });
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function previewReportData(type, params = {}) {
  const path = reportPath('preview', type, params);
  const res = await api.get(path);
  return res.data.data;
}
