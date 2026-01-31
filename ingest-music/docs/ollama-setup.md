# Ollama Setup Guide

This guide covers installing and configuring Ollama for local LLM inference with GPU acceleration.

## Overview

Ollama is a local LLM runtime that supports running open-source models like Llama, Qwen, and Gemma on your machine. It can use GPU acceleration for faster inference and works well for the music ingestion tool's AI-assisted parsing features.

## Prerequisites

- **Operating System**: Linux (native or WSL2), macOS, or Windows
- **GPU (Optional but Recommended)**: NVIDIA GPU with CUDA support
  - For WSL2: Requires Windows 11 or Windows 10 with WSL2 GPU passthrough enabled
  - Driver version: NVIDIA 470+ with WSL support
- **Disk Space**: 5-10GB for models (varies by model size)
- **RAM**: 8GB minimum, 16GB+ recommended for larger models

## Installation

### Linux (Native or WSL2)

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

This will:
- Install Ollama to `/usr/local/bin`
- Create an `ollama` system user
- Set up a systemd service for auto-start
- Configure GPU access (if available)

### macOS

```bash
# Download from https://ollama.com/download
# Or use Homebrew:
brew install ollama
```

### Windows

Download the installer from [https://ollama.com/download](https://ollama.com/download)

## GPU Setup (NVIDIA)

### Verify GPU Access

Check if your GPU is accessible:

```bash
nvidia-smi
```

You should see output showing your GPU model, driver version, and CUDA version.

### WSL2 GPU Passthrough

If running in WSL2, ensure GPU passthrough is working:

1. **Install NVIDIA drivers on Windows host** (not in WSL2)
   - Download from [https://www.nvidia.com/download/index.aspx](https://www.nvidia.com/download/index.aspx)
   - Use version 470.76 or newer with WSL support

2. **Verify in WSL2**:
   ```bash
   nvidia-smi
   ls /dev/dri  # Should show card0, renderD128
   ```

3. Ollama will automatically detect and use the GPU

### Performance Expectations

**With GPU (e.g., RTX 3060 Ti 8GB):**
- 7B models: 1-5 seconds per response
- 13B models: 3-10 seconds per response (with quantization)

**CPU Only:**
- 7B models: 10-60 seconds per response
- 13B models: 30-120+ seconds per response

## Starting Ollama

### Check Service Status

```bash
systemctl status ollama
```

### Start/Stop Service

```bash
# Start
sudo systemctl start ollama

# Stop
sudo systemctl stop ollama

# Restart
sudo systemctl restart ollama

# Enable auto-start on boot
sudo systemctl enable ollama
```

### Manual Start (for debugging)

```bash
ollama serve
```

By default, Ollama listens on `http://127.0.0.1:11434`

## Downloading Models

### Recommended Models for Music Ingestion

| Model | Size | Best For | Speed (GPU) |
|-------|------|----------|-------------|
| `qwen2.5:7b` | 4.7GB | Structured outputs, JSON | Fast |
| `llama3.1:8b` | 4.7GB | General reasoning | Fast |
| `gemma2:9b` | 5.5GB | Reasoning, analysis | Medium |
| `llama3.2:3b` | 2.0GB | Quick tasks, lower quality | Very Fast |

### Download a Model

```bash
ollama pull qwen2.5:7b
```

This downloads the model and stores it in `~/.ollama/models/`

### List Installed Models

```bash
ollama list
```

Example output:
```
NAME          ID              SIZE      MODIFIED
qwen2.5:7b    845dbda0ea48    4.7 GB    2 hours ago
```

### Remove a Model

```bash
ollama rm qwen2.5:7b
```

## Running Queries

### Interactive Mode

Start a chat session with a model:

```bash
ollama run qwen2.5:7b
```

Type your prompts and press Enter. Type `/bye` to exit.

### Single Query (CLI)

```bash
ollama run qwen2.5:7b "What is the capital of France?"
```

### JSON Mode

For structured outputs (useful for our integration):

```bash
ollama run qwen2.5:7b 'Respond with valid JSON only: {"city": "Paris", "country": "France"}'
```

### Using the API

Ollama exposes a REST API on `http://127.0.0.1:11434`

#### Basic Request (curl)

```bash
curl http://127.0.0.1:11434/api/generate -d '{
  "model": "qwen2.5:7b",
  "prompt": "What is the capital of France?",
  "stream": false
}'
```

#### Request with JSON Schema (curl)

```bash
curl http://127.0.0.1:11434/api/generate -d '{
  "model": "qwen2.5:7b",
  "prompt": "Extract the date from this text: \"Live show in Berlin on Nov 10, 2025\"",
  "format": "json",
  "stream": false
}'
```

#### Node.js Example

```javascript
async function queryOllama(prompt) {
  const response = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen2.5:7b',
      prompt: prompt,
      stream: false
    })
  });

  const data = await response.json();
  return data.response;
}

// Usage
const answer = await queryOllama('What is 2 + 2?');
console.log(answer);
```

#### TypeScript with Ollama SDK

Install the official SDK:

```bash
npm install ollama
```

```typescript
import { Ollama } from 'ollama';

const ollama = new Ollama({ host: 'http://127.0.0.1:11434' });

// Simple query
const response = await ollama.generate({
  model: 'qwen2.5:7b',
  prompt: 'What is the capital of France?'
});

console.log(response.response);

// JSON mode
const jsonResponse = await ollama.generate({
  model: 'qwen2.5:7b',
  prompt: 'Return a JSON object with city and country for Paris',
  format: 'json'
});

const parsed = JSON.parse(jsonResponse.response);
console.log(parsed);
```

## Testing Your Setup

### Quick GPU Test

```bash
ollama run qwen2.5:7b 'Respond with valid JSON only: {"status": "ok", "message": "GPU working"}' --verbose
```

Look for these metrics in the output:
- `total duration`: Total time (includes loading on first run)
- `load duration`: Time to load model into memory
- Inference time = total duration - load duration

First run will be slow (30+ seconds) due to loading. Subsequent runs should be 1-5 seconds with GPU.

### Check GPU Usage During Inference

In another terminal while a query is running:

```bash
watch -n 1 nvidia-smi
```

You should see:
- GPU memory usage increase (model loaded into VRAM)
- GPU utilization spike during inference

## Configuration

### Environment Variables

Create `/etc/systemd/system/ollama.service.d/override.conf`:

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"  # Listen on all interfaces
Environment="OLLAMA_MODELS=/path/to/models"  # Custom model directory
Environment="OLLAMA_NUM_PARALLEL=2"  # Number of parallel requests
Environment="OLLAMA_MAX_LOADED_MODELS=1"  # Max models in memory
Environment="OLLAMA_VULKAN=0"  # Disable Vulkan (use CUDA instead)
```

Reload after changes:
```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

### Model-Specific Settings

When running a model, you can customize:

```bash
ollama run qwen2.5:7b \
  --temperature 0.7 \
  --top-p 0.9 \
  --top-k 40 \
  --num-predict 500
```

Or via API:
```json
{
  "model": "qwen2.5:7b",
  "prompt": "Your prompt here",
  "options": {
    "temperature": 0.7,
    "top_p": 0.9,
    "top_k": 40,
    "num_predict": 500
  }
}
```

## Troubleshooting

### Service Won't Start

```bash
# Check logs
journalctl -u ollama -f

# Check if port is in use
sudo lsof -i :11434

# Try manual start to see errors
ollama serve
```

### GPU Not Detected

```bash
# Verify NVIDIA driver
nvidia-smi

# Check Ollama can see GPU
ollama serve  # Look for GPU detection messages

# Force CUDA
export OLLAMA_VULKAN=0
sudo systemctl restart ollama
```

### Out of Memory

If you get CUDA out of memory errors:

1. Use smaller models (3b or 7b instead of 13b+)
2. Reduce max loaded models:
   ```bash
   export OLLAMA_MAX_LOADED_MODELS=1
   ```
3. Use quantized models (Q4_K_M variants are smaller)

### Slow Performance

1. Verify GPU is being used (check with `nvidia-smi`)
2. Ensure model is loaded (first query is always slower)
3. Check temperature/throttling: `nvidia-smi dmon`
4. Use smaller models if GPU VRAM is limited

## Model Selection Guide

### For Music Ingestion Tasks

**Setlist Mismatch Analysis** (medium complexity):
- Recommended: `qwen2.5:7b` or `llama3.1:8b`
- Needs good reasoning and structured outputs

**Date Extraction** (low complexity):
- Recommended: `qwen2.5:7b` or `llama3.2:3b`
- Fast, straightforward task

**Artist/Venue Parsing** (medium complexity):
- Recommended: `qwen2.5:7b`
- Good at handling variations and fuzzy matching

**Track Name Matching** (low complexity):
- Recommended: `llama3.2:3b`
- Speed matters more than perfect accuracy

### Testing Different Models

```bash
# Download and test multiple models
ollama pull qwen2.5:7b
ollama pull llama3.1:8b
ollama pull gemma2:9b

# Compare on a test prompt
for model in qwen2.5:7b llama3.1:8b gemma2:9b; do
  echo "Testing $model..."
  time ollama run $model "Parse this date: 'Berlin 11/10/25'" --verbose
done
```

## Integration with Music Ingestion Tool

Once Ollama is set up, you can integrate it with the music ingestion tool by:

1. Install Ollama Node.js SDK: `npm install ollama`
2. Implement the Ollama provider in `src/llm/providers/ollama.ts`
3. Configure in `config.json`:
   ```json
   {
     "llm": {
       "enabled": true,
       "provider": "ollama",
       "model": "qwen2.5:7b",
       "apiEndpoint": "http://127.0.0.1:11434"
     }
   }
   ```

See `llm-integration-plan.md` for full implementation details.

## Resources

- **Official Documentation**: [https://github.com/ollama/ollama/blob/main/README.md](https://github.com/ollama/ollama/blob/main/README.md)
- **Model Library**: [https://ollama.com/library](https://ollama.com/library)
- **API Reference**: [https://github.com/ollama/ollama/blob/main/docs/api.md](https://github.com/ollama/ollama/blob/main/docs/api.md)
- **Node.js SDK**: [https://github.com/ollama/ollama-js](https://github.com/ollama/ollama-js)

## Quick Reference

```bash
# Install
curl -fsSL https://ollama.com/install.sh | sh

# Download model
ollama pull qwen2.5:7b

# Run query
ollama run qwen2.5:7b "Your prompt here"

# List models
ollama list

# Check service
systemctl status ollama

# View logs
journalctl -u ollama -f

# API endpoint
curl http://127.0.0.1:11434/api/generate -d '{"model":"qwen2.5:7b","prompt":"test"}'
```
