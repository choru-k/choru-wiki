const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

if (isMainThread) {
  // 메인 스레드: Worker 관리
  module.exports = { validateDiagramWithWorker };
} else {
  // Worker 스레드: 실제 검증 작업
  validateDiagramWorker();
}

/**
 * Worker에서 다이어그램 검증
 */
async function validateDiagramWorker() {
  const diagram = workerData;
  const result = await validateDiagramInWorker(diagram);
  parentPort.postMessage(result);
}

/**
 * Worker 스레드에서 실제 mmdc 검증 수행
 */
async function validateDiagramInWorker(diagram) {
  const tempInputFile = path.join(os.tmpdir(), `mermaid-worker-${process.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.mmd`);
  
  try {
    fs.writeFileSync(tempInputFile, diagram.content);
    
    // mmdc로 실제 파싱 검증 - PNG 출력으로 완전한 렌더링 테스트
    const tempOutputFile = tempInputFile.replace('.mmd', '.png');
    
    try {
      // mmdc 명령어 실행 - 실제 렌더링으로 완전한 검증
      execSync(`npx mmdc -i "${tempInputFile}" -o "${tempOutputFile}" --quiet`, { 
        stdio: 'pipe',
        timeout: 30000  // 30초 타임아웃
      });
      
      // 출력 파일이 생성되었는지 확인
      if (!fs.existsSync(tempOutputFile)) {
        throw new Error('Output file not generated - diagram parsing failed');
      }
      
      // 임시 파일 정리
      fs.unlinkSync(tempInputFile);
      fs.unlinkSync(tempOutputFile);
      
      return { 
        valid: true, 
        diagram
      };
      
    } catch (error) {
      // 임시 파일 정리
      if (fs.existsSync(tempInputFile)) fs.unlinkSync(tempInputFile);
      if (fs.existsSync(tempOutputFile)) fs.unlinkSync(tempOutputFile);
      
      // mmdc 실행 오류 처리
      let errorMessage = 'Diagram parsing failed';
      
      if (error.stderr) {
        const stderr = error.stderr.toString();
        
        // 일반적인 Mermaid 오류 패턴 추출
        const errorPatterns = [
          /Error: (.+)/,
          /Parse error on line (\d+):.+/,
          /Expecting (.+)/,
          /Lexical error on line (\d+)/,
          /syntax error/i,
          /Cannot read properties of undefined/
        ];
        
        for (const pattern of errorPatterns) {
          const match = stderr.match(pattern);
          if (match) {
            errorMessage = match[0];
            break;
          }
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      return {
        valid: false,
        diagram,
        error: errorMessage
      };
    }
    
  } catch (error) {
    // 파일 I/O 오류 처리
    if (fs.existsSync(tempInputFile)) fs.unlinkSync(tempInputFile);
    
    return {
      valid: false,
      diagram,
      error: `File I/O error: ${error.message}`
    };
  }
}

/**
 * Worker를 사용한 다이어그램 검증
 */
function validateDiagramWithWorker(diagram) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, {
      workerData: diagram
    });
    
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}