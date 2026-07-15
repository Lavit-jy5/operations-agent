const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

async function request(path, options = {}) {
  let response;
  const isFormData = options.body instanceof FormData;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch {
    throw new Error(`无法连接后端服务：${API_BASE_URL}。请确认后端已启动，或检查前端 .env 里的 VITE_API_BASE_URL。`);
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `请求失败：${response.status}`);
  }

  return response.json();
}

export function getHealth() {
  return request("/health");
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
