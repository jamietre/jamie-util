# Context - USB SMART Monitor Project

## Where We Are

You initiated a planning session to build a Synology DSM package for monitoring USB device SMART status. We completed the planning phase and created comprehensive documentation.

## Decisions Made

### 1. Package Dependencies
- ✅ **Bundle hdsentinel binary** with the package (self-contained approach)

### 2. Package Type
- ✅ **CLI + Web UI** implementation
  - CLI tool for command-line usage and scripting
  - Web dashboard on port 8280 for user-friendly monitoring
  - Background service for continuous monitoring

### 3. Build Environment
- ✅ **Linux with Docker** using spksrc framework
  - Building on your Linux machine (or WSL)
  - Using Docker for reproducible builds
  - spksrc handles cross-compilation

## What We've Done

1. ✅ Analyzed your existing script (`check-usb-smart.sh`)
2. ✅ Researched Synology DSM package development
3. ✅ Designed complete implementation approach
4. ✅ Created detailed plan with:
   - Project structure
   - Technology stack selection
   - Step-by-step build process
   - Testing procedures
   - Troubleshooting guide

## Files Created

In this directory (`C:\code\jamie-util\usb-status` or `/mnt/c/code/jamie-util/usb-status` in WSL):

- **CONTEXT.md** - This file (conversation state)
- **QUICKSTART.md** - Immediate next steps and commands

Also saved to Claude plan storage:
- `C:\Users\jamie\.claude\plans\inherited-stargazing-sketch.md` - Full implementation plan

## What You Need to Do Next

### In WSL (Linux):

1. **Navigate to project directory**
   ```bash
   cd /mnt/c/code/jamie-util/usb-status
   ```

2. **Clone spksrc**
   ```bash
   git clone https://github.com/SynoCommunity/spksrc.git
   cd spksrc
   ```

3. **Build Docker image**
   ```bash
   docker build -t spksrc-builder .
   ```

4. **Create directory structure**
   ```bash
   mkdir -p cross/usb-smart-monitor/src/{bin,server,cli,ui}
   mkdir -p spk/usb-smart-monitor/src
   ```

5. **Copy hdsentinel binary from NAS**
   ```bash
   scp admin@synology2:/volume1/homes/admin/scripts/hdsentinel/hdsentinel \
       cross/usb-smart-monitor/src/bin/
   scp admin@synology2:/volume1/homes/admin/scripts/hdsentinel/detjm \
       cross/usb-smart-monitor/src/bin/
   chmod +x cross/usb-smart-monitor/src/bin/*
   ```

6. **Start implementing files**
   - See QUICKSTART.md for file creation checklist
   - See full plan for detailed file contents

## Key Technology Choices

### Backend
- **Node.js + Express.js** - API server
- **SQLite** - Device health history storage
- **Bash scripts** - CLI tools and hdsentinel wrappers

### Frontend
- **Vanilla JavaScript** - No heavy frameworks (DSM compatibility)
- **Chart.js** - Health history visualization
- **Modern CSS** - DSM-inspired styling

### Build
- **spksrc** - Official Synology package build framework
- **Docker** - Containerized build environment
- **x86-64 only** - hdsentinel limitation

## Critical Information

### Paths
- **Windows Project**: `C:\code\jamie-util\usb-status`
- **WSL Project**: `/mnt/c/code/jamie-util/usb-status`
- **NAS Script**: `C:\mount\network\synology2\homes\admin\scripts\check-usb-smart.sh`
- **NAS Binary**: `/volume1/homes/admin/scripts/hdsentinel/`

### Configuration
- **Web UI Port**: 8280
- **Check Interval**: 3600 seconds (1 hour)
- **Target DSM**: 7.0+
- **Architecture**: x86-64 only

### Important Constraints
1. **hdsentinel requires root** - Will configure sudoers during install
2. **hdsentinel directory dependency** - Must run from binary directory
3. **Licensing check needed** - Verify redistribution rights before packaging
4. **Architecture limitation** - Won't work on ARM-based Synology NAS

## Questions Still Open

1. **hdsentinel Licensing** - Need to verify if redistribution is allowed
   - Check license terms
   - Contact developer if unclear
   - May need download-on-install mechanism

2. **Testing NAS** - Confirm you have x86-64 architecture
   ```bash
   ssh admin@synology2 "uname -m"
   # Should output: x86_64
   ```

## Resuming Work

When you return to this project:

1. Read **QUICKSTART.md** for immediate commands
2. Refer to **full plan** (`C:\Users\jamie\.claude\plans\inherited-stargazing-sketch.md`) for detailed implementation
3. Check **CONTEXT.md** (this file) for state

You're currently at: **Phase 1 - Setup Build Environment**

Next milestone: Clone spksrc and build Docker image

## Estimated Timeline

- **Setup** (Days 1-2): Environment setup, directory structure
- **CLI** (Days 3-4): CLI tools and wrappers
- **Backend** (Days 5-7): Node.js service and API
- **Frontend** (Days 8-10): Web dashboard
- **Testing** (Days 11-12): Build, install, test

Total: ~2 weeks for first working version

## Resources

- spksrc: https://github.com/SynoCommunity/spksrc
- DSM Guide: https://help.synology.com/developer-guide/
- hdsentinel: https://www.hdsentinel.com/hard_disk_sentinel_linux.php

---

**Last Updated**: 2026-02-06
**Status**: Planning Complete, Ready for Implementation
**Next Action**: Switch to WSL and begin setup
