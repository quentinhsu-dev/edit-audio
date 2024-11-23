import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';

interface AudioCropperProps {
  maxFileSize?: number;
}

interface AudioFileState {
  file: File | null;
  duration: number;
  url: string;
}

const AudioCropper: React.FC<AudioCropperProps> = ({
  maxFileSize = 10 * 1024 * 1024,
}) => {
  const [audioFile, setAudioFile] = useState<AudioFileState>({
    file: null,
    duration: 0,
    url: '',
  });
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [croppedAudioUrl, setCroppedAudioUrl] = useState<string>('');
  const [isFFmpegLoaded, setIsFFmpegLoaded] = useState<boolean>(false);

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // 初始化 FFmpeg
  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        const ffmpeg = new FFmpeg();
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/esm';

        // 配置日志
        ffmpeg.on('log', ({ message }) => {
          console.log('FFmpeg log:', message);
        });

        // 配置进度
        ffmpeg.on('progress', ({ progress }) => {
          console.log('FFmpeg progress:', progress);
        });

        // 加载 CoreWasm 文件
        await ffmpeg.load({
          coreURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.js`,
            'text/javascript',
          ),
          wasmURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.wasm`,
            'application/wasm',
          ),
        });

        ffmpegRef.current = ffmpeg;
        setIsFFmpegLoaded(true);
      } catch (error) {
        console.error('FFmpeg 加载失败:', error);
        alert('FFmpeg 初始化错误，音频裁剪功能可能不可用');
      }
    };

    loadFFmpeg();
  }, []);

  // 文件拖拽处理
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'audio/*': ['.mp3', '.wav', '.ogg', '.m4a'],
    },
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0];
      if (file.size > maxFileSize) {
        alert(`文件大小不能超过 ${maxFileSize / 1024 / 1024}MB`);
        return;
      }

      const url = URL.createObjectURL(file);
      setAudioFile({ file, url, duration: 0 });

      // 加载音频元数据获取时长
      const audio = new Audio(url);
      audio.onloadedmetadata = () => {
        setAudioFile((prev) => ({ ...prev, duration: audio.duration }));
        setEndTime(audio.duration);
      };
    },
  });

  // 音频裁剪处理
  const handleCrop = async () => {
    if (!audioFile.file || !ffmpegRef.current || !isFFmpegLoaded) {
      alert('FFmpeg未完全加载或未选择文件');
      return;
    }

    setIsProcessing(true);

    try {
      const ffmpeg = ffmpegRef.current;

      // 转换文件为 ArrayBuffer
      const fileBuffer = await audioFile.file.arrayBuffer();

      // 写入文件
      await ffmpeg.writeFile('input.mp3', new Uint8Array(fileBuffer));

      // 执行裁剪命令
      await ffmpeg.exec([
        '-i',
        'input.mp3',
        '-ss',
        `${startTime}`,
        '-to',
        `${endTime}`,
        '-c',
        'copy',
        'output.mp3',
      ]);

      // 检查文件是否存在
      const fileExists = await ffmpeg.readFile('output.mp3').catch(() => null);

      if (!fileExists) {
        throw new Error('裁剪后的文件未生成');
      }

      // 读取裁剪后的文件
      const data = await ffmpeg.readFile('output.mp3');
      const blob = new Blob([data.buffer], { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);

      setCroppedAudioUrl(url);
    } catch (error) {
      console.error('裁剪失败', error);
      alert(
        `音频裁剪出现错误: ${error instanceof Error ? error.message : '未知错误'}`,
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // 下载裁剪后的音频
  const downloadCroppedAudio = () => {
    if (!croppedAudioUrl) return;

    const link = document.createElement('a');
    link.href = croppedAudioUrl;
    link.download = 'cropped_audio.mp3';
    link.click();
  };

  return (
    <div className="audio-cropper">
      <div
        {...getRootProps()}
        className="drop-zone"
        style={{
          border: '2px dashed #cccccc',
          padding: '20px',
          textAlign: 'center',
          cursor: 'pointer',
        }}
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p>松开鼠标上传文件</p>
        ) : (
          <p>拖拽音频文件至此处，或点击选择文件</p>
        )}
      </div>

      {audioFile.file && (
        <div className="audio-controls">
          <audio
            ref={audioRef}
            src={audioFile.url}
            controls
            style={{ width: '100%' }}
          />

          <div className="time-controls">
            <div>
              <label>开始时间(秒):</label>
              <input
                type="number"
                value={startTime}
                min={0}
                max={endTime}
                onChange={(e) => setStartTime(Number(e.target.value))}
              />
            </div>

            <div>
              <label>结束时间(秒):</label>
              <input
                type="number"
                value={endTime}
                min={startTime}
                max={audioFile.duration}
                onChange={(e) => setEndTime(Number(e.target.value))}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleCrop}
            disabled={isProcessing || !isFFmpegLoaded}
          >
            {isProcessing ? '处理中...' : '裁剪音频'}
          </button>
        </div>
      )}

      {croppedAudioUrl && (
        <div className="cropped-audio-preview">
          <audio src={croppedAudioUrl} controls style={{ width: '100%' }} />
          <button type="button" onClick={downloadCroppedAudio}>
            下载裁剪后的音频
          </button>
        </div>
      )}
    </div>
  );
};

export default AudioCropper;
