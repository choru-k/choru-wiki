#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const { execSync } = require('child_process');
const os = require('os');
const { validateDiagramWithWorker } = require('./validate-mermaid-worker');

/**
 * 마크다운 파일에서 Mermaid 다이어그램을 추출
 */
function extractMermaidDiagrams(content, filename) {
  const mermaidBlockRegex = /```mermaid\n([\s\S]*?)\n```/g;
  const diagrams = [];
  let match;
  let blockNumber = 1;

  while ((match = mermaidBlockRegex.exec(content)) !== null) {
    diagrams.push({
      content: match[1].trim(),
      filename,
      blockNumber: blockNumber++,
      lineNumber: content.substring(0, match.index).split('\n').length
    });
  }

  return diagrams;
}

/**
 * 병렬 처리로 다이어그램들 검증
 */
async function validateDiagramsConcurrently(diagrams, maxWorkers = os.cpus().length) {
  const results = [];
  const workers = [];
  const queue = [...diagrams];
  
  console.log(`🔧 ${maxWorkers}개 Worker로 병렬 처리 시작...`);
  
  // Worker 풀 생성 및 처리
  const promises = [];
  for (let i = 0; i < Math.min(maxWorkers, queue.length); i++) {
    promises.push(processQueue());
  }
  
  async function processQueue() {
    while (queue.length > 0) {
      const diagram = queue.shift();
      if (!diagram) break;
      
      try {
        const result = await validateDiagramWithWorker(diagram);
        results.push(result);
      } catch (error) {
        results.push({
          valid: false,
          diagram,
          error: `Worker error: ${error.message}`
        });
      }
    }
  }
  
  await Promise.all(promises);
  
  // 원래 순서대로 정렬
  results.sort((a, b) => {
    const aIndex = diagrams.findIndex(d => 
      d.filename === a.diagram.filename && 
      d.blockNumber === a.diagram.blockNumber
    );
    const bIndex = diagrams.findIndex(d => 
      d.filename === b.diagram.filename && 
      d.blockNumber === b.diagram.blockNumber
    );
    return aIndex - bIndex;
  });
  
  return results;
}

/**
 * 사용법 출력
 */
function printUsage() {
  console.log(`
🔍 Mermaid 다이어그램 검증 도구

사용법:
  node scripts/validate-mermaid.js [경로]

예시:
  node scripts/validate-mermaid.js                    # 전체 docs 폴더 검증
  node scripts/validate-mermaid.js docs/db           # 특정 폴더만 검증  
  node scripts/validate-mermaid.js docs/demo.md      # 특정 파일만 검증
  node scripts/validate-mermaid.js "docs/**/*.md"    # 글롭 패턴 사용

특징:
  ✅ 항상 mmdc로 완전한 실제 파싱 검증
  ✅ false positive 절대 없음 (실제 렌더링 테스트)
  ✅ 특정 파일/폴더 검증 지원
  ⚡ Worker threads 병렬 처리 (CPU 코어 수만큼 병렬)
  🚀 이전 버전 대비 ${os.cpus().length}x 속도 향상 예상
`);
}

/**
 * 메인 함수
 */
async function main() {
  const args = process.argv.slice(2);
  
  // 도움말 요청
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }
  
  const startTime = Date.now();
  console.log('🔍 Mermaid 다이어그램 완전 검증을 시작합니다...\n');
  console.log('📋 실제 mmdc 렌더링으로 검증 (false positive 없음)\n');
  
  try {
    // 검증 대상 경로 결정
    let searchPattern;
    let targetDescription;
    
    if (args.length === 0) {
      // 기본: 전체 docs 폴더
      searchPattern = 'docs/**/*.md';
      targetDescription = '전체 docs 폴더';
    } else {
      const targetPath = args[0];
      
      if (fs.existsSync(targetPath)) {
        const stats = fs.statSync(targetPath);
        
        if (stats.isFile()) {
          // 단일 파일
          searchPattern = targetPath;
          targetDescription = `파일: ${targetPath}`;
        } else if (stats.isDirectory()) {
          // 디렉토리
          searchPattern = `${targetPath}/**/*.md`;
          targetDescription = `폴더: ${targetPath}`;
        }
      } else {
        // 글롭 패턴 또는 존재하지 않는 경로
        searchPattern = targetPath;
        targetDescription = `패턴: ${targetPath}`;
      }
    }
    
    console.log(`🎯 검증 대상: ${targetDescription}`);
    
    // 파일 검색
    const files = await glob(searchPattern, { 
      cwd: process.cwd(),
      absolute: true 
    });

    if (files.length === 0) {
      console.log(`❌ 검증할 파일을 찾을 수 없습니다: ${searchPattern}`);
      return;
    }

    // 모든 다이어그램을 먼저 수집
    let allDiagrams = [];
    let processedFiles = 0;
    
    console.log(`📂 ${files.length}개 파일에서 Mermaid 다이어그램 수집 중...\n`);

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        
        if (!content.includes('```mermaid')) continue;
        
        const diagrams = extractMermaidDiagrams(content, path.relative(process.cwd(), file));
        
        if (diagrams.length === 0) continue;

        processedFiles++;
        allDiagrams.push(...diagrams);
        console.log(`📄 ${path.relative(process.cwd(), file)} (${diagrams.length}개 다이어그램)`);
        
      } catch (error) {
        console.log(`⚠️  파일 읽기 실패: ${path.relative(process.cwd(), file)} - ${error.message}`);
      }
    }
    
    if (allDiagrams.length === 0) {
      console.log('❌ 검증할 Mermaid 다이어그램이 없습니다.');
      return;
    }
    
    console.log(`\n🚀 총 ${allDiagrams.length}개 다이어그램을 병렬 검증 시작...\n`);
    
    // 병렬 검증 실행
    const results = await validateDiagramsConcurrently(allDiagrams);
    
    // 결과 분석
    let validDiagrams = 0;
    let errors = [];
    let currentFile = '';
    
    console.log('📋 검증 결과:\n');
    
    for (const result of results) {
      const diagram = result.diagram;
      
      // 파일별 헤더 출력
      if (currentFile !== diagram.filename) {
        if (currentFile !== '') console.log(''); // 파일 구분용 빈 줄
        currentFile = diagram.filename;
        const fileResults = results.filter(r => r.diagram.filename === diagram.filename);
        const fileValidCount = fileResults.filter(r => r.valid).length;
        console.log(`📄 ${diagram.filename} (${fileResults.length}개 다이어그램, ${fileValidCount}개 유효)`);
      }
      
      if (result.valid) {
        validDiagrams++;
        console.log(`  ✅ Block ${diagram.blockNumber} (line ${diagram.lineNumber}): 유효함`);
      } else {
        errors.push({
          filename: diagram.filename,
          blockNumber: diagram.blockNumber,
          lineNumber: diagram.lineNumber,
          error: result.error
        });
        console.log(`  ❌ Block ${diagram.blockNumber} (line ${diagram.lineNumber}): ${result.error}`);
      }
    }
    
    const totalDiagrams = allDiagrams.length;
    
    // 최종 결과 출력
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('📊 최종 결과:');
    console.log(`  처리한 파일: ${processedFiles}개`);
    console.log(`  검증한 다이어그램: ${totalDiagrams}개`);
    console.log(`  유효한 다이어그램: ${validDiagrams}개 (${totalDiagrams > 0 ? ((validDiagrams / totalDiagrams) * 100).toFixed(1) : 0}%)`);
    console.log(`  오류가 있는 다이어그램: ${errors.length}개 (${totalDiagrams > 0 ? ((errors.length / totalDiagrams) * 100).toFixed(1) : 0}%)`);
    console.log(`  소요 시간: ${duration}초`);
    
    if (totalDiagrams > 0) {
      console.log(`  처리 속도: ${(totalDiagrams / parseFloat(duration)).toFixed(1)}개/초`);
    }
    
    if (errors.length > 0) {
      console.log('\n🚨 발견된 오류들:\n');
      
      errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.filename} (Block ${error.blockNumber}, Line ${error.lineNumber})`);
        console.log(`   오류: ${error.error}\n`);
      });
      
      // 비정상 종료 (CI/CD에서 실패 감지용)
      process.exit(1);
    } else {
      console.log('\n✅ 모든 Mermaid 다이어그램이 유효합니다!');
    }
    
  } catch (error) {
    console.error('❌ 검증 실행 중 오류 발생:', error.message);
    process.exit(1);
  }
}

// 스크립트 직접 실행시에만 main 함수 호출
if (require.main === module) {
  main().catch(error => {
    console.error('❌ 처리되지 않은 오류:', error);
    process.exit(1);
  });
}

module.exports = {
  extractMermaidDiagrams,
  validateDiagramsConcurrently
};