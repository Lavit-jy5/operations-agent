const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";
const AUTH_TOKEN_KEY = "operations_agent_auth_token";

export function getAuthToken() {
  return window.localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

export function setAuthToken(token) {
  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  }
}

export function clearAuthToken() {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

async function request(path, options = {}) {
  let response;
  const isFormData = options.body instanceof FormData;
  const token = getAuthToken();
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch {
    throw new Error(`无法连接后端服务：${API_BASE_URL}。请确认后端已启动，或检查前端 .env 里的 VITE_API_BASE_URL。`);
  }

  if (!response.ok) {
    const message = await response.text();
    if (response.status === 401) {
      clearAuthToken();
    }
    throw new Error(message || `请求失败：${response.status}`);
  }

  return response.json();
}

export function getHealth() {
  return request("/health");
}

export function loginWithPassword(password) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export function verifyAuth() {
  return request("/auth/verify");
}

export function queryWind(payload) {
  return request("/wind/query", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function generateBrief(payload) {
  return request("/brief/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function qualityCheck(payload) {
  return request("/brief/quality-check", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function generateTitleCandidates(payload) {
  return request("/brief/title-candidates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function exportBriefDocx(payload) {
  const token = getAuthToken();
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/brief/export-docx`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(`无法连接后端服务：${API_BASE_URL}。请确认后端已启动。`);
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `导出失败：${response.status}`);
  }

  const disposition = response.headers.get("content-disposition") || "";
  const filenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)/);
  return {
    blob: await response.blob(),
    filename: filenameMatch ? decodeURIComponent(filenameMatch[1]) : "运营内容草稿.docx",
  };
}

export function getGenerations() {
  return request("/generations");
}

export function extractMaterials(files) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));

  return request("/materials/extract", {
    method: "POST",
    body: formData,
  });
}

export function extractVisionMaterials(files, context = "", imageUsages = []) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  formData.append("context", context);
  formData.append("image_usages", JSON.stringify(imageUsages));

  return request("/materials/vision-extract", {
    method: "POST",
    body: formData,
  });
}

export function expandPrompt(payload) {
  return request("/prompt/expand", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getLogs() {
  return request("/logs");
}
