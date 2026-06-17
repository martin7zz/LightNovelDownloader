import sys
import os
import subprocess
from PyQt5.QtWidgets import (
    QApplication, QWidget, QPushButton,
    QVBoxLayout, QTextEdit, QProgressBar, QFileDialog
)
from PyQt5.QtCore import QThread, pyqtSignal
from pathlib import Path

def resource_path(relative_path):
    return os.path.join(
        getattr(sys, '_MEIPASS', os.path.dirname(__file__)),
        relative_path
    )

env = os.environ.copy()
env["NODE_PATH"] = resource_path("node/node_modules")

class Worker(QThread):
    output_signal = pyqtSignal(str)
    finished_signal = pyqtSignal()

    def __init__(self, command):
        super().__init__()
        self.command = command
        self.process = None
        self.running = True
        
        self.active_task = None
        
        self.download_directory  = str(Path.home() / "Downloads")

    def run(self):
        try:
            self.process = subprocess.Popen(
                self.command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=subprocess.CREATE_NO_WINDOW,
                env=env,
            )

            for line in self.process.stdout:
                if not self.running:
                    break
                self.output_signal.emit(line.strip())
                
            self.process.wait()

        except Exception as e:
            self.output_signal.emit(f"ERROR: {str(e)}")

        self.finished_signal.emit()

    def stop(self):
        self.running = False
        if self.process:
            self.process.terminate()


class App(QWidget):
    def __init__(self):
        super().__init__()

        self.setWindowTitle("Novel Downloader")
        self.resize(700, 500)

        self.layout = QVBoxLayout()

        self.download_novels = QPushButton("Download Novels")
        self.create_database = QPushButton("Create Novels List")
        self.change_directory = QPushButton("Change Download Directory")
        self.stop_btn = QPushButton("Stop")
        self.stop_btn.setEnabled(False)

        self.progress = QProgressBar()
        self.progress.setRange(0, 0)  # infinite animation
        self.progress.setVisible(False)

        self.output_box = QTextEdit()
        self.output_box.setReadOnly(True)

        self.layout.addWidget(self.download_novels)
        self.layout.addWidget(self.create_database)
        self.layout.addWidget(self.change_directory)
        self.layout.addWidget(self.stop_btn)
        self.layout.addWidget(self.progress)
        self.layout.addWidget(self.output_box)

        self.setLayout(self.layout)

        self.worker = None

        self.download_novels.clicked.connect(self.start_novel_download)
        self.create_database.clicked.connect(self.start_database_creation)
        self.change_directory.clicked.connect(self.change_download_directory)
        self.stop_btn.clicked.connect(self.stop_process)
    
    def start_novel_download(self):
        self.output_box.clear()
        self.active_task = "downloader"
        
        folder_arg = getattr(self, "download_directory", None)
        node_path = resource_path("node/node.exe")
        script_path = resource_path("downloader/firefoxDownloader.js")

        command = [node_path, script_path]
        
        if folder_arg:
            command.append(folder_arg)
        
        self.worker = Worker(command)
        self.start_worker()
    
    def change_download_directory(self):
        default_dir = getattr(self, "download_directory", str(Path.home() / "Downloads"))
        
        folder = QFileDialog.getExistingDirectory(
            self,
            "Select Download Directory",
            default_dir
        )
        
        if folder:
            self.download_directory = folder
            self.output_box.append(f"Download directory set to: {folder}")
        
    def start_database_creation(self):
        self.output_box.clear()
        self.active_task = "db"
        
        node_path = resource_path("node/node.exe")
        script_path = resource_path("database/db.js")

        command = [node_path, script_path]
        self.worker = Worker(command)
        self.start_worker()
    
    def start_worker(self):
        self.worker.output_signal.connect(self.update_output)
        self.worker.finished_signal.connect(self.process_finished)

        self.worker.start()

        self.create_database.setEnabled(False)
        self.download_novels.setEnabled(False)
        self.stop_btn.setEnabled(True)
        self.progress.setVisible(True)

    def stop_process(self):
        if self.worker:
            self.worker.stop()
            self.output_box.append("Stopped Process.")

    def update_output(self, text):
        self.output_box.append(text)

        if "Fetching page" in text:
            self.progress.setFormat(text)

    def process_finished(self):
        if (self.active_task == "db"):
            self.output_box.append("Database fully updated.")
        elif (self.active_task == "downloader"):
            self.output_box.append("Novels fully downloaded.")
            
        self.create_database.setEnabled(True)
        self.download_novels.setEnabled(True)
        self.stop_btn.setEnabled(False)
        self.progress.setVisible(False)
        
        self.active_task = None
        


app = QApplication(sys.argv)
window = App()
window.show()
app.exec_()