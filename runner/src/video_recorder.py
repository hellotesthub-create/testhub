#!/usr/bin/env python3
"""
Video Recorder - Records test execution as video using Selenium Grid approach
Based on proven method with docker exec into Selenium containers
"""
from datetime import datetime
from pathlib import Path
import subprocess
import time
import os
from logger import setup_logger

logger = setup_logger("video_recorder")


class VideoRecorder:
    """Records screen during test execution using Selenium Grid containers"""
    
    def __init__(self, output_dir: str = "/app/output/videos"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.recording = False
        self.video_filename = None
        self.container_name = None
        self.browser = None
        self.ffmpeg_pid = None  # Track specific ffmpeg PID
        
    def start_recording(self, test_name: str, browser: str = "chrome"):
        """
        Start recording using FFmpeg inside Selenium Grid container
        This is the EXACT approach from your friend's working code
        
        Args:
            test_name: Name of the test being recorded
            browser: Browser type ("chrome" or "firefox")
        """
        try:
            # Store browser for stop_recording
            self.browser = browser.lower()
            
            # Container name mapping (same as friend's code)
            self.container_name = f"selenium-{self.browser}"
            
            # Create timestamped filename with microseconds to ensure uniqueness in parallel runs
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            microseconds = datetime.now().microsecond
            self.video_filename = f"{self.browser}_{test_name}_{timestamp}_{microseconds}.mp4"
            
            # Build ffmpeg command to run INSIDE Selenium container
            # This is the CRITICAL part - we exec into the Grid container
            cmd = [
                "docker", "exec", "-d", self.container_name,
                "ffmpeg", 
                "-video_size", "1920x1080",
                "-framerate", "25",
                "-f", "x11grab",
                "-i", ":99.0",  # Xvfb display inside Selenium container
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-pix_fmt", "yuv420p",
                f"/videos/{self.video_filename}"  # Saved to volume mount
            ]
            
            # Execute command (detached mode - runs in background)
            logger.info(f"🎬 Executing: docker exec -d {self.container_name} ffmpeg...")
            result = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            # Wait for ffmpeg to initialize (same as friend's code)
            time.sleep(2)
            
            # Check if ffmpeg is running and store PID for specific termination
            check_cmd = ["docker", "exec", self.container_name, "pgrep", "-f", self.video_filename]
            check_result = subprocess.run(check_cmd, capture_output=True, text=True)
            if check_result.returncode == 0:
                self.ffmpeg_pid = check_result.stdout.strip().split()[0]  # Get first PID
                logger.info(f"✅ FFmpeg running (PID: {self.ffmpeg_pid})")
                self.recording = True
            else:
                logger.warning(f"⚠️ FFmpeg process not found!")
                # Try to get error from docker exec
                test_cmd = ["docker", "exec", self.container_name, "ffmpeg", "-version"]
                test_result = subprocess.run(test_cmd, capture_output=True, text=True)
                if test_result.returncode != 0:
                    logger.error(f"FFmpeg not available: {test_result.stderr}")
                self.recording = False
            
            logger.info(f"🎥 Recording: {self.video_filename}")
            
            # Return path on host filesystem
            return str(self.output_dir / self.video_filename)
            
        except Exception as e:
            logger.error(f"❌ Failed to start video recording: {e}")
            self.recording = False
            return None
    
    def stop_recording(self):
        """
        Stop the recording by killing ffmpeg inside Selenium container
        Uses the EXACT method from your friend's code
        """
        if not self.recording or not self.container_name:
            return None
            
        try:
            # Kill ONLY this specific ffmpeg process to avoid stopping other parallel tests
            if self.ffmpeg_pid:
                # Kill by specific PID
                subprocess.run(
                    ["docker", "exec", self.container_name, "kill", self.ffmpeg_pid],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                logger.info(f"🛑 Recording stopped (PID: {self.ffmpeg_pid})")
            else:
                # Fallback: kill by filename pattern
                subprocess.run(
                    ["docker", "exec", self.container_name, "pkill", "-f", self.video_filename],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL
                )
                logger.info("🛑 Recording stopped")
            
            # CRITICAL: Wait 3 seconds for ffmpeg to finalize the video file
            # Without this, video will be corrupted or incomplete
            time.sleep(3)
            
            self.recording = False
            
            # Check if video file exists and get size
            video_path = self.output_dir / self.video_filename
            if video_path.exists():
                file_size = video_path.stat().st_size
                size_mb = file_size / (1024 * 1024)
                logger.info(f"📹 Video: {self.video_filename} ({size_mb:.2f} MB)")
                return str(video_path)
            else:
                logger.warning(f"⚠️ Video file not found: {self.video_filename}")
                return None
                
        except Exception as e:
            logger.error(f"❌ Failed to stop video recording: {e}")
            return None
        finally:
            # Reset state
            self.container_name = None
            self.video_filename = None
            self.browser = None
            self.ffmpeg_pid = None
    
    def is_recording(self):
        """Check if currently recording"""
        return self.recording
