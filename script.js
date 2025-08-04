let timeChart = null;
let durationChart = null;
let minuteChart = null;
let avgResponseTimeChart = null;
let sessionChart = null;
let computerChart = null;
let requestGroupChart = null;
let fullMinuteChart = null; // 전체 분별 차트 추가
let fullSessionChart = null; // 전체 세션 차트 추가
let fullComputerChart = null; // 전체 컴퓨터 차트 추가
let fullRequestGroupChart = null; // 전체 요청 그룹 차트 추가
let selectedFile = null;
let allLogs = []; // 전체 로그 데이터 저장
let filteredLogs = []; // 필터링된 로그 데이터

// 줌 기능 관련 변수
let isZoomMode = false; // 줌 모드 상태
let zoomMode = 'drag'; // 'drag' 또는 'select'

// 차트 타입 설정
let chartTypes = {
  time: 'line',
  minute: 'line',
  duration: 'line',
  session: 'bar',
  computer: 'bar',
  requestGroup: 'bar'
};

// 모달창 차트 타입 설정 (독립적)
let modalChartType = 'bar';
let modalSessionChartType = 'bar';
let modalComputerChartType = 'bar';
let modalRequestGroupChartType = 'bar';

// 대용량 파일 처리를 위한 설정
const BATCH_SIZE = 1000; // 한 번에 처리할 로그 수
const CHUNK_SIZE = 1024 * 1024; // 1MB 청크 단위로 읽기

function showError(message) {
  const errorContainer = document.getElementById('errorContainer');
  errorContainer.innerHTML = `<div class="error-message">${message}</div>`;
}

function clearError() {
  document.getElementById('errorContainer').innerHTML = '';
}

function showLoading() {
  document.getElementById('loadingContainer').style.display = 'block';
  document.getElementById('statsContainer').style.display = 'none';
}

function hideLoading() {
  document.getElementById('loadingContainer').style.display = 'none';
}

// 스트림 방식으로 파일 읽기 (대용량 파일 최적화)
function readFileAsStream(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let content = '';
    let offset = 0;

    reader.onload = function (e) {
      content += e.target.result;
      offset += e.target.result.length;

      // 파일이 끝나지 않았으면 다음 청크 읽기
      if (offset < file.size) {
        const nextChunk = file.slice(offset, offset + CHUNK_SIZE);
        reader.readAsText(nextChunk);
      } else {
        resolve(content);
      }
    };

    reader.onerror = reject;

    // 첫 번째 청크 읽기
    const firstChunk = file.slice(0, CHUNK_SIZE);
    reader.readAsText(firstChunk);
  });
}

// 배치 처리로 JSON 파싱 (메모리 최적화)
function parseLogFileInBatches(content) {
  const lines = content.split('\n').filter(line => line.trim());
  const logs = [];

  // 배치 단위로 처리하여 스택 오버플로우 방지
  for (let i = 0; i < lines.length; i += BATCH_SIZE) {
    const batch = lines.slice(i, i + BATCH_SIZE);

    for (const line of batch) {
      try {
        const log = JSON.parse(line);

        // 새로운 로그 구조에 맞게 기본값 설정
        const enhancedLog = {
          ...log,
          // 새로운 필드들이 없으면 기본값 설정
          request_id: log.request_id || "20250729134456245223_d1287721_d2ad6785_0470",
          request_group_id: log.request_group_id || "GROUP_220_118_0_154",
          session_id: log.session_id || "1753762567.993907_d2ad6785_9579",
          computer_id: log.computer_id || "COMP_b8e621986b64_1753762567.993923"
        };

        logs.push(enhancedLog);
      } catch (e) {
        console.warn('Invalid JSON line:', line);
      }
    }

    // 진행률 업데이트 (대용량 파일 처리 시)
    if (lines.length > 10000) {
      const progress = Math.round((i + BATCH_SIZE) / lines.length * 100);
      updateLoadingProgress(progress);
    }
  }

  return logs;
}

// 로딩 진행률 업데이트
function updateLoadingProgress(progress) {
  const loadingContainer = document.getElementById('loadingContainer');
  const progressText = `로그 파일을 분석하고 있습니다... ${Math.min(progress, 100)}%`;
  loadingContainer.innerHTML = `<div class="loading">${progressText}</div>`;
}

// 기존 parseLogFile 함수를 최적화된 버전으로 교체
function parseLogFile(content) {
  return parseLogFileInBatches(content);
}

async function analyzeLogs() {
  if (!selectedFile) {
    showError('먼저 로그 파일을 선택해주세요.');
    return;
  }

  clearError();
  showLoading();

  try {
    // 파일 크기 확인
    const fileSizeMB = selectedFile.size / (1024 * 1024);
    console.log(`파일 크기: ${fileSizeMB.toFixed(2)}MB`);

    // 대용량 파일 처리 시 경고
    if (fileSizeMB > 50) {
      console.log('대용량 파일 감지. 최적화된 처리 방식을 사용합니다.');
    }

    // 스트림 방식으로 파일 읽기
    const content = await readFileAsStream(selectedFile);

    // 배치 처리로 JSON 파싱
    allLogs = parseLogFile(content);
    filteredLogs = allLogs;

    if (filteredLogs.length === 0) {
      throw new Error('로그 파일에서 유효한 JSON 데이터를 찾을 수 없습니다.');
    }

    console.log(`총 ${filteredLogs.length.toLocaleString()}개의 로그를 처리했습니다.`);

    // 통계 계산을 배치로 처리
    await processStatsInBatches(filteredLogs);

    // 차트 생성
    createCharts(filteredLogs);
    displayDetailedStats(filteredLogs);
    displayErrorDetails(filteredLogs);

    hideLoading();
    document.getElementById('statsContainer').style.display = 'block';

    // 필터 컨테이너 표시 및 시간대 옵션 생성
    setupFilters();

    // 차트 컨트롤 표시
    setupChartControls();
  } catch (error) {
    hideLoading();
    showError('로그 분석 중 오류가 발생했습니다: ' + error.message);
    console.error('분석 오류:', error);
  }
}

// 배치 처리로 통계 계산 (메모리 최적화)
async function processStatsInBatches(logs) {
  return new Promise((resolve) => {
    // 비동기로 처리하여 UI 블로킹 방지
    setTimeout(() => {
      displayStats(logs);
      resolve();
    }, 0);
  });
}

function setupFilters() {
  const filterContainer = document.getElementById('filterContainer');
  if (filterContainer) {
    filterContainer.style.display = 'block';
  }

  // 날짜 범위 설정
  setupDateRange();

  // 시간대 옵션 생성
  const hours = new Set();
  allLogs.forEach(log => {
    if (log.timestamp) {
      const hour = log.timestamp.split(' ')[1].split(':')[0];
      hours.add(parseInt(hour));
    }
  });

  const sortedHours = Array.from(hours).sort((a, b) => a - b);
  const startHourSelect = document.getElementById('startHour');
  const endHourSelect = document.getElementById('endHour');

  // 기존 옵션 제거 (전체 옵션 제외)
  if (startHourSelect) {
    startHourSelect.innerHTML = '<option value="">전체</option>';
  }
  if (endHourSelect) {
    endHourSelect.innerHTML = '<option value="">전체</option>';
  }

  // 시간대 옵션 추가
  sortedHours.forEach(hour => {
    if (startHourSelect) {
      const startOption = document.createElement('option');
      startOption.value = hour;
      startOption.textContent = hour + '시';
      startHourSelect.appendChild(startOption);
    }

    if (endHourSelect) {
      const endOption = document.createElement('option');
      endOption.value = hour;
      endOption.textContent = hour + '시';
      endHourSelect.appendChild(endOption);
    }
  });

  // 새로운 필드들에 대한 필터 옵션 생성
  setupAdvancedFilters();
}

// 날짜 범위 설정 함수
function setupDateRange() {
  const dates = new Set();
  allLogs.forEach(log => {
    if (log.timestamp) {
      const date = log.timestamp.split(' ')[0];
      dates.add(date);
    }
  });

  const sortedDates = Array.from(dates).sort();
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');

  if (startDateInput && sortedDates.length > 0) {
    startDateInput.min = sortedDates[0];
    startDateInput.max = sortedDates[sortedDates.length - 1];
  }

  if (endDateInput && sortedDates.length > 0) {
    endDateInput.min = sortedDates[0];
    endDateInput.max = sortedDates[sortedDates.length - 1];
  }
}

// 날짜 필터 적용 함수
function applyDateFilter() {
  const startDateElement = document.getElementById('startDate');
  const endDateElement = document.getElementById('endDate');
  const logTypeFilterElement = document.getElementById('logTypeFilter');
  const sessionFilterElement = document.getElementById('sessionFilter');
  const computerFilterElement = document.getElementById('computerFilter');
  const requestGroupFilterElement = document.getElementById('requestGroupFilter');

  const startDate = startDateElement ? startDateElement.value : '';
  const endDate = endDateElement ? endDateElement.value : '';
  const logTypeFilter = logTypeFilterElement ? logTypeFilterElement.value : 'all';
  const sessionFilter = sessionFilterElement ? sessionFilterElement.value : '';
  const computerFilter = computerFilterElement ? computerFilterElement.value : '';
  const requestGroupFilter = requestGroupFilterElement ? requestGroupFilterElement.value : '';

  // 필터링 최적화
  filteredLogs = [];
  for (let i = 0; i < allLogs.length; i++) {
    const log = allLogs[i];

    // 로그 타입 필터 적용
    if (logTypeFilter !== 'all' && log.status !== logTypeFilter) {
      continue;
    }

    // 세션 필터 적용 (짧은 ID 사용)
    if (sessionFilter) {
      const shortSessionId = shortenSessionId(log.session_id);
      if (shortSessionId !== sessionFilter) {
        continue;
      }
    }

    // 컴퓨터 필터 적용 (짧은 ID 사용)
    if (computerFilter) {
      const shortComputerId = shortenComputerId(log.computer_id);
      if (shortComputerId !== computerFilter) {
        continue;
      }
    }

    // 요청 그룹 필터 적용 (짧은 ID 사용)
    if (requestGroupFilter) {
      const shortRequestGroupId = shortenRequestGroupId(log.request_group_id);
      if (shortRequestGroupId !== requestGroupFilter) {
        continue;
      }
    }

    // 날짜 필터 적용
    if (!log.timestamp) continue;

    const logDate = log.timestamp.split(' ')[0];
    let dateMatch = true;

    if (startDate && endDate) {
      dateMatch = logDate >= startDate && logDate <= endDate;
    } else if (startDate) {
      dateMatch = logDate >= startDate;
    } else if (endDate) {
      dateMatch = logDate <= endDate;
    }

    if (dateMatch) {
      filteredLogs.push(log);
    }
  }

  // 필터링된 데이터로 차트와 통계 업데이트
  displayStats(filteredLogs);
  createCharts(filteredLogs);
  displayDetailedStats(filteredLogs);
  displayErrorDetails(filteredLogs);
}

function setupAdvancedFilters() {
  // 세션 ID 필터
  const sessions = new Set();
  const computers = new Set();
  const requestGroups = new Set();
  const sessionIdMapping = {};
  const computerIdMapping = {};
  const requestGroupIdMapping = {};

  allLogs.forEach(log => {
    if (log.session_id) {
      const shortId = shortenSessionId(log.session_id);
      sessions.add(shortId);
      sessionIdMapping[shortId] = log.session_id;
    }
    if (log.computer_id) {
      const shortId = shortenComputerId(log.computer_id);
      computers.add(shortId);
      computerIdMapping[shortId] = log.computer_id;
    }
    if (log.request_group_id) {
      const shortId = shortenRequestGroupId(log.request_group_id);
      requestGroups.add(shortId);
      requestGroupIdMapping[shortId] = log.request_group_id;
    }
  });

  // 세션 필터 옵션 생성
  const sessionFilter = document.getElementById('sessionFilter');
  if (sessionFilter) {
    sessionFilter.innerHTML = '<option value="">전체</option>';
    Array.from(sessions).sort().forEach(shortId => {
      const option = document.createElement('option');
      option.value = shortId;
      option.textContent = shortId;
      sessionFilter.appendChild(option);
    });
  }

  // 컴퓨터 필터 옵션 생성
  const computerFilter = document.getElementById('computerFilter');
  if (computerFilter) {
    computerFilter.innerHTML = '<option value="">전체</option>';
    Array.from(computers).sort().forEach(shortId => {
      const option = document.createElement('option');
      option.value = shortId;
      option.textContent = shortId;
      computerFilter.appendChild(option);
    });
  }

  // 요청 그룹 필터 옵션 생성
  const requestGroupFilter = document.getElementById('requestGroupFilter');
  if (requestGroupFilter) {
    requestGroupFilter.innerHTML = '<option value="">전체</option>';
    Array.from(requestGroups).sort().forEach(shortId => {
      const option = document.createElement('option');
      option.value = shortId;
      option.textContent = shortId;
      requestGroupFilter.appendChild(option);
    });
  }
}

function applyLogTypeFilter() {
  const logTypeFilterElement = document.getElementById('logTypeFilter');
  const sessionFilterElement = document.getElementById('sessionFilter');
  const computerFilterElement = document.getElementById('computerFilter');
  const requestGroupFilterElement = document.getElementById('requestGroupFilter');
  const startDateElement = document.getElementById('startDate');
  const endDateElement = document.getElementById('endDate');

  const logTypeFilter = logTypeFilterElement ? logTypeFilterElement.value : 'all';
  const sessionFilter = sessionFilterElement ? sessionFilterElement.value : '';
  const computerFilter = computerFilterElement ? computerFilterElement.value : '';
  const requestGroupFilter = requestGroupFilterElement ? requestGroupFilterElement.value : '';
  const startDate = startDateElement ? startDateElement.value : '';
  const endDate = endDateElement ? endDateElement.value : '';

  // 필터링 최적화
  if (logTypeFilter === 'all' && !sessionFilter && !computerFilter && !requestGroupFilter && !startDate && !endDate) {
    filteredLogs = allLogs;
  } else {
    filteredLogs = [];
    for (let i = 0; i < allLogs.length; i++) {
      const log = allLogs[i];

      // 로그 타입 필터 적용
      if (logTypeFilter !== 'all' && log.status !== logTypeFilter) {
        continue;
      }

      // 세션 필터 적용 (짧은 ID 사용)
      if (sessionFilter) {
        const shortSessionId = shortenSessionId(log.session_id);
        if (shortSessionId !== sessionFilter) {
          continue;
        }
      }

      // 컴퓨터 필터 적용 (짧은 ID 사용)
      if (computerFilter) {
        const shortComputerId = shortenComputerId(log.computer_id);
        if (shortComputerId !== computerFilter) {
          continue;
        }
      }

      // 요청 그룹 필터 적용 (짧은 ID 사용)
      if (requestGroupFilter) {
        const shortRequestGroupId = shortenRequestGroupId(log.request_group_id);
        if (shortRequestGroupId !== requestGroupFilter) {
          continue;
        }
      }

      // 날짜 필터 적용
      if (startDate || endDate) {
        if (!log.timestamp) continue;

        const logDate = log.timestamp.split(' ')[0];
        let dateMatch = true;

        if (startDate && endDate) {
          dateMatch = logDate >= startDate && logDate <= endDate;
        } else if (startDate) {
          dateMatch = logDate >= startDate;
        } else if (endDate) {
          dateMatch = logDate <= endDate;
        }

        if (!dateMatch) {
          continue;
        }
      }

      filteredLogs.push(log);
    }
  }

  // 필터링된 데이터로 차트와 통계 업데이트
  displayStats(filteredLogs);
  createCharts(filteredLogs);
  displayDetailedStats(filteredLogs);
  displayErrorDetails(filteredLogs);
}

function applyTimeFilter() {
  const startHourElement = document.getElementById('startHour');
  const endHourElement = document.getElementById('endHour');
  const logTypeFilterElement = document.getElementById('logTypeFilter');
  const sessionFilterElement = document.getElementById('sessionFilter');
  const computerFilterElement = document.getElementById('computerFilter');
  const requestGroupFilterElement = document.getElementById('requestGroupFilter');
  const startDateElement = document.getElementById('startDate');
  const endDateElement = document.getElementById('endDate');

  const startHour = startHourElement ? startHourElement.value : '';
  const endHour = endHourElement ? endHourElement.value : '';
  const logTypeFilter = logTypeFilterElement ? logTypeFilterElement.value : 'all';
  const sessionFilter = sessionFilterElement ? sessionFilterElement.value : '';
  const computerFilter = computerFilterElement ? computerFilterElement.value : '';
  const requestGroupFilter = requestGroupFilterElement ? requestGroupFilterElement.value : '';
  const startDate = startDateElement ? startDateElement.value : '';
  const endDate = endDateElement ? endDateElement.value : '';

  // 필터링 최적화
  filteredLogs = [];
  for (let i = 0; i < allLogs.length; i++) {
    const log = allLogs[i];

    // 로그 타입 필터 적용
    if (logTypeFilter !== 'all' && log.status !== logTypeFilter) {
      continue;
    }

    // 세션 필터 적용 (짧은 ID 사용)
    if (sessionFilter) {
      const shortSessionId = shortenSessionId(log.session_id);
      if (shortSessionId !== sessionFilter) {
        continue;
      }
    }

    // 컴퓨터 필터 적용 (짧은 ID 사용)
    if (computerFilter) {
      const shortComputerId = shortenComputerId(log.computer_id);
      if (shortComputerId !== computerFilter) {
        continue;
      }
    }

    // 요청 그룹 필터 적용 (짧은 ID 사용)
    if (requestGroupFilter) {
      const shortRequestGroupId = shortenRequestGroupId(log.request_group_id);
      if (shortRequestGroupId !== requestGroupFilter) {
        continue;
      }
    }

    // 날짜 필터 적용
    if (startDate || endDate) {
      if (!log.timestamp) continue;

      const logDate = log.timestamp.split(' ')[0];
      let dateMatch = true;

      if (startDate && endDate) {
        dateMatch = logDate >= startDate && logDate <= endDate;
      } else if (startDate) {
        dateMatch = logDate >= startDate;
      } else if (endDate) {
        dateMatch = logDate <= endDate;
      }

      if (!dateMatch) {
        continue;
      }
    }

    // 시간 필터 적용
    if (!log.timestamp) continue;

    const [date, time] = log.timestamp.split(' ');
    const hour = parseInt(time.split(':')[0]);

    let timeMatch = true;
    if (startHour && endHour) {
      timeMatch = hour >= parseInt(startHour) && hour <= parseInt(endHour);
    } else if (startHour) {
      timeMatch = hour >= parseInt(startHour);
    } else if (endHour) {
      timeMatch = hour <= parseInt(endHour);
    }

    if (timeMatch) {
      filteredLogs.push(log);
    }
  }

  // 필터링된 데이터로 차트와 통계 업데이트
  displayStats(filteredLogs);
  createCharts(filteredLogs);
  displayDetailedStats(filteredLogs);
  displayErrorDetails(filteredLogs);
}

function clearTimeFilter() {
  const startHourElement = document.getElementById('startHour');
  const endHourElement = document.getElementById('endHour');
  const startDateElement = document.getElementById('startDate');
  const endDateElement = document.getElementById('endDate');

  if (startHourElement) {
    startHourElement.value = '';
  }
  if (endHourElement) {
    endHourElement.value = '';
  }
  if (startDateElement) {
    startDateElement.value = '';
  }
  if (endDateElement) {
    endDateElement.value = '';
  }

  applyLogTypeFilter(); // 로그 타입 필터만 적용
}

function displayStats(logs) {
  // 대용량 데이터 처리를 위한 최적화
  const totalLogs = logs.length;

  // 성공/실패 로그 수 계산 (한 번의 순회로 처리)
  let successLogs = 0;
  let failLogs = 0;
  const errorTypes = new Set();
  const uniqueIPs = new Set();
  const responseTimes = [];
  const socketCounts = [];
  const errorCounts = {};
  const hourlyCounts = {};
  const minuteCounts = {};
  const uniqueSessions = new Set();
  const uniqueComputers = new Set();
  const uniqueRequestGroups = new Set();

  // 한 번의 순회로 모든 통계 계산 (메모리 최적화)
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];

    // 성공/실패 카운트
    if (log.status === 'success') {
      successLogs++;
    } else {
      failLogs++;
      // 에러 타입 수집
      if (log.error_type) {
        errorTypes.add(log.error_type);
        errorCounts[log.error_type] = (errorCounts[log.error_type] || 0) + 1;
      }
    }

    // 고유 IP 수집
    if (log.client_ip) {
      uniqueIPs.add(log.client_ip);
    }

    // 새로운 필드들 수집
    if (log.session_id) {
      uniqueSessions.add(log.session_id);
    }
    if (log.computer_id) {
      uniqueComputers.add(log.computer_id);
    }
    if (log.request_group_id) {
      uniqueRequestGroups.add(log.request_group_id);
    }

    // 응답시간 수집
    if (log.socket_duration_ms && log.socket_duration_ms > 0) {
      responseTimes.push(log.socket_duration_ms);
    }

    // 소켓 수 수집
    const socketCount = log.selected_sockets || log.read_sockets || 0;
    if (socketCount > 0) {
      socketCounts.push(socketCount);
    }

    // 시간별 통계
    if (log.timestamp) {
      const [date, time] = log.timestamp.split(' ');
      const [hour, minute] = time.split(':');
      const dateHourKey = `${date} ${hour}`;
      hourlyCounts[dateHourKey] = (hourlyCounts[dateHourKey] || 0) + 1;

      const timeKey = `${date} ${hour}:${minute}`;
      minuteCounts[timeKey] = (minuteCounts[timeKey] || 0) + 1;
    }
  }

  // 통계 계산
  const successRate = totalLogs > 0 ? ((successLogs / totalLogs) * 100).toFixed(1) : 0;
  const uniqueErrorTypes = errorTypes.size;
  const uniqueIPsCount = uniqueIPs.size;
  const uniqueSessionsCount = uniqueSessions.size;
  const uniqueComputersCount = uniqueComputers.size;
  const uniqueRequestGroupsCount = uniqueRequestGroups.size;

  // 세션별 요청 수 분석
  const sessionRequestCounts = {};
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (log.session_id) {
      sessionRequestCounts[log.session_id] = (sessionRequestCounts[log.session_id] || 0) + 1;
    }
  }

  // 가장 활발한 세션 찾기
  let mostActiveSession = '-';
  let maxSessionRequests = 0;
  const sessionEntries = Object.entries(sessionRequestCounts);
  for (let i = 0; i < sessionEntries.length; i++) {
    const [sessionId, count] = sessionEntries[i];
    if (count > maxSessionRequests) {
      maxSessionRequests = count;
      mostActiveSession = shortenSessionId(sessionId);
    }
  }

  // 평균 세션당 요청 수
  const avgRequestsPerSession = uniqueSessionsCount > 0 ? (totalLogs / uniqueSessionsCount).toFixed(2) : 0;

  // 응답시간 통계 (최적화된 방식)
  let avgResponseTime = 0;
  let maxResponseTime = 0;
  let minResponseTime = 0;

  if (responseTimes.length > 0) {
    let totalResponseTime = 0;
    maxResponseTime = responseTimes[0];
    minResponseTime = responseTimes[0];

    for (let i = 0; i < responseTimes.length; i++) {
      const time = responseTimes[i];
      totalResponseTime += time;
      if (time > maxResponseTime) maxResponseTime = time;
      if (time < minResponseTime) minResponseTime = time;
    }

    avgResponseTime = (totalResponseTime / responseTimes.length).toFixed(2);
    maxResponseTime = maxResponseTime.toFixed(2);
    minResponseTime = minResponseTime.toFixed(2);
  }

  // 평균 소켓 수 (최적화된 방식)
  let avgSockets = 0;
  if (socketCounts.length > 0) {
    let totalSockets = 0;
    for (let i = 0; i < socketCounts.length; i++) {
      totalSockets += socketCounts[i];
    }
    avgSockets = (totalSockets / socketCounts.length).toFixed(2);
  }

  // 가장 빈번한 에러
  const mostFrequentError = Object.entries(errorCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || '-';

  // 최고 발생 시간대 (최적화된 방식)
  let peakHour = '-';
  let maxHourCount = 0;
  const hourEntries = Object.entries(hourlyCounts);
  for (let i = 0; i < hourEntries.length; i++) {
    const [dateHour, count] = hourEntries[i];
    if (count > maxHourCount) {
      maxHourCount = count;
      const [date, hour] = dateHour.split(' ');
      peakHour = `${date} ${hour}시`;
    }
  }

  // 최고 발생 분 (최적화된 방식)
  let peakMinute = '-';
  let maxMinuteCount = 0;
  const minuteEntries = Object.entries(minuteCounts);
  for (let i = 0; i < minuteEntries.length; i++) {
    const [dateTime, count] = minuteEntries[i];
    if (count > maxMinuteCount) {
      maxMinuteCount = count;
      const [date, time] = dateTime.split(' ');
      peakMinute = `${date} ${time}`;
    }
  }

  // DOM 업데이트
  document.getElementById('totalLogs').textContent = totalLogs.toLocaleString();
  document.getElementById('successLogs').textContent = successLogs.toLocaleString();
  document.getElementById('failLogs').textContent = failLogs.toLocaleString();
  document.getElementById('successRate').textContent = successRate + '%';
  document.getElementById('uniqueErrorTypes').textContent = uniqueErrorTypes.toLocaleString();
  document.getElementById('uniqueIPs').textContent = uniqueIPsCount.toLocaleString();
  document.getElementById('avgResponseTime').textContent = avgResponseTime + 'ms';
  document.getElementById('maxResponseTime').textContent = maxResponseTime + 'ms';
  document.getElementById('minResponseTime').textContent = minResponseTime + 'ms';
  document.getElementById('avgSockets').textContent = avgSockets;
  document.getElementById('mostFrequentError').textContent = mostFrequentError;
  document.getElementById('peakHour').textContent = peakHour === '-' ? '-' : peakHour;
  document.getElementById('peakMinute').textContent = peakMinute === '-' ? '-' : peakMinute;
  document.getElementById('uniqueSessions').textContent = uniqueSessionsCount.toLocaleString();
  document.getElementById('uniqueComputers').textContent = uniqueComputersCount.toLocaleString();
  document.getElementById('uniqueRequestGroups').textContent = uniqueRequestGroupsCount.toLocaleString();
  document.getElementById('mostActiveSession').textContent = mostActiveSession;
  document.getElementById('avgRequestsPerSession').textContent = avgRequestsPerSession;

  // 긴 텍스트에 대한 폰트 크기 조정
  adjustFontSize('mostFrequentError', mostFrequentError);
}

function adjustFontSize(elementId, text) {
  const element = document.getElementById(elementId);
  if (!element) return;

  // 긴 텍스트에 대한 폰트 크기 조정
  if (text && text.length > 15) {
    element.style.fontSize = '1.8em';
  } else if (text && text.length > 10) {
    element.style.fontSize = '2.2em';
  } else {
    element.style.fontSize = '2.5em';
  }
}

function displayDetailedStats(logs) {
  // 성공/실패별 통계
  let successLogs = 0;
  let failLogs = 0;
  let successTotalTime = 0;
  let failTotalTime = 0;

  // 에러 타입별 통계
  const errorTypeStats = {};

  // 응답시간 구간별 통계
  const durationRanges = [
    { min: 0, max: 100, label: '0-100ms' },
    { min: 100, max: 500, label: '100-500ms' },
    { min: 500, max: 1000, label: '500ms-1s' },
    { min: 1000, max: 5000, label: '1s-5s' },
    { min: 5000, max: Infinity, label: '5s 이상' }
  ];

  const durationStats = {};
  durationRanges.forEach(range => {
    durationStats[range.label] = {
      count: 0,
      totalTime: 0,
      times: []
    };
  });

  // 소켓 타입별 통계
  const socketStats = {
    read_sockets: { count: 0, totalTime: 0, times: [] },
    write_sockets: { count: 0, totalTime: 0, times: [] },
    except_sockets: { count: 0, totalTime: 0, times: [] },
    selected_sockets: { count: 0, totalTime: 0, times: [] }
  };

  // 새로운 필드별 통계
  const sessionStats = {};
  const computerStats = {};
  const requestGroupStats = {};

  // 한 번의 순회로 모든 통계 계산 (최적화)
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const duration = log.socket_duration_ms || 0;

    // 성공/실패별 통계
    if (log.status === 'success') {
      successLogs++;
      successTotalTime += duration;
    } else {
      failLogs++;
      failTotalTime += duration;

      // 에러 타입별 통계
      const errorType = log.error_type || 'unknown';
      if (!errorTypeStats[errorType]) {
        errorTypeStats[errorType] = {
          count: 0,
          totalTime: 0,
          times: []
        };
      }
      errorTypeStats[errorType].count++;
      errorTypeStats[errorType].totalTime += duration;
      errorTypeStats[errorType].times.push(duration);
    }

    // 응답시간 구간별 통계
    const range = durationRanges.find(r => duration >= r.min && duration < r.max);
    if (range) {
      durationStats[range.label].count++;
      durationStats[range.label].totalTime += duration;
      durationStats[range.label].times.push(duration);
    }

    // 소켓 타입별 통계
    if (log.read_sockets) {
      socketStats.read_sockets.count++;
      socketStats.read_sockets.totalTime += duration;
      socketStats.read_sockets.times.push(duration);
    }
    if (log.write_sockets) {
      socketStats.write_sockets.count++;
      socketStats.write_sockets.totalTime += duration;
      socketStats.write_sockets.times.push(duration);
    }
    if (log.except_sockets) {
      socketStats.except_sockets.count++;
      socketStats.except_sockets.totalTime += duration;
      socketStats.except_sockets.times.push(duration);
    }
    if (log.selected_sockets) {
      socketStats.selected_sockets.count++;
      socketStats.selected_sockets.totalTime += duration;
      socketStats.selected_sockets.times.push(duration);
    }

    // 새로운 필드별 통계
    if (log.session_id) {
      if (!sessionStats[log.session_id]) {
        sessionStats[log.session_id] = { count: 0, totalTime: 0, times: [] };
      }
      sessionStats[log.session_id].count++;
      sessionStats[log.session_id].totalTime += duration;
      sessionStats[log.session_id].times.push(duration);
    }

    if (log.computer_id) {
      if (!computerStats[log.computer_id]) {
        computerStats[log.computer_id] = { count: 0, totalTime: 0, times: [] };
      }
      computerStats[log.computer_id].count++;
      computerStats[log.computer_id].totalTime += duration;
      computerStats[log.computer_id].times.push(duration);
    }

    if (log.request_group_id) {
      if (!requestGroupStats[log.request_group_id]) {
        requestGroupStats[log.request_group_id] = { count: 0, totalTime: 0, times: [] };
      }
      requestGroupStats[log.request_group_id].count++;
      requestGroupStats[log.request_group_id].totalTime += duration;
      requestGroupStats[log.request_group_id].times.push(duration);
    }
  }

  // 테이블 생성
  const tbody = document.getElementById('detailedStatsBody');
  tbody.innerHTML = '';

  const totalLogs = logs.length;

  // 성공/실패별 통계
  if (successLogs > 0) {
    const row = tbody.insertRow();
    const avgTime = successTotalTime / successLogs;
    const percentage = ((successLogs / totalLogs) * 100).toFixed(1);

    row.insertCell(0).textContent = '성공 요청';
    row.insertCell(1).textContent = successLogs.toLocaleString();
    row.insertCell(2).textContent = percentage + '%';
    row.insertCell(3).textContent = avgTime.toFixed(2) + 'ms';
  }

  if (failLogs > 0) {
    const row = tbody.insertRow();
    const avgTime = failTotalTime / failLogs;
    const percentage = ((failLogs / totalLogs) * 100).toFixed(1);

    row.insertCell(0).textContent = '실패 요청';
    row.insertCell(1).textContent = failLogs.toLocaleString();
    row.insertCell(2).textContent = percentage + '%';
    row.insertCell(3).textContent = avgTime.toFixed(2) + 'ms';
  }

  // 에러 타입별 통계
  const errorEntries = Object.entries(errorTypeStats);
  for (let i = 0; i < errorEntries.length; i++) {
    const [errorType, stats] = errorEntries[i];
    const row = tbody.insertRow();
    const percentage = ((stats.count / totalLogs) * 100).toFixed(1);
    const avgTime = stats.count > 0 ? (stats.totalTime / stats.count).toFixed(2) : 0;

    row.insertCell(0).textContent = `에러 타입: ${errorType}`;
    row.insertCell(1).textContent = stats.count.toLocaleString();
    row.insertCell(2).textContent = percentage + '%';
    row.insertCell(3).textContent = avgTime + 'ms';
  }

  // 응답시간 구간별 통계
  const durationEntries = Object.entries(durationStats);
  for (let i = 0; i < durationEntries.length; i++) {
    const [range, stats] = durationEntries[i];
    if (stats.count > 0) {
      const row = tbody.insertRow();
      const percentage = ((stats.count / totalLogs) * 100).toFixed(1);
      const avgTime = stats.count > 0 ? (stats.totalTime / stats.count).toFixed(2) : 0;

      row.insertCell(0).textContent = `응답시간: ${range}`;
      row.insertCell(1).textContent = stats.count.toLocaleString();
      row.insertCell(2).textContent = percentage + '%';
      row.insertCell(3).textContent = avgTime + 'ms';
    }
  }

  // 소켓 타입별 통계
  const socketEntries = Object.entries(socketStats);
  for (let i = 0; i < socketEntries.length; i++) {
    const [socketType, stats] = socketEntries[i];
    if (stats.count > 0) {
      const row = tbody.insertRow();
      const percentage = ((stats.count / totalLogs) * 100).toFixed(1);
      const avgTime = stats.count > 0 ? (stats.totalTime / stats.count).toFixed(2) : 0;

      row.insertCell(0).textContent = `소켓 타입: ${socketType}`;
      row.insertCell(1).textContent = stats.count.toLocaleString();
      row.insertCell(2).textContent = percentage + '%';
      row.insertCell(3).textContent = avgTime + 'ms';
    }
  }

  // 새로운 필드별 통계
  const sessionEntries = Object.entries(sessionStats);
  for (let i = 0; i < sessionEntries.length; i++) {
    const [sessionId, stats] = sessionEntries[i];
    if (stats.count > 0) {
      const row = tbody.insertRow();
      const percentage = ((stats.count / totalLogs) * 100).toFixed(1);
      const avgTime = stats.count > 0 ? (stats.totalTime / stats.count).toFixed(2) : 0;

      row.insertCell(0).textContent = `세션: ${sessionId}`;
      row.insertCell(1).textContent = stats.count.toLocaleString();
      row.insertCell(2).textContent = percentage + '%';
      row.insertCell(3).textContent = avgTime + 'ms';
    }
  }

  const computerEntries = Object.entries(computerStats);
  for (let i = 0; i < computerEntries.length; i++) {
    const [computerId, stats] = computerEntries[i];
    if (stats.count > 0) {
      const row = tbody.insertRow();
      const percentage = ((stats.count / totalLogs) * 100).toFixed(1);
      const avgTime = stats.count > 0 ? (stats.totalTime / stats.count).toFixed(2) : 0;

      row.insertCell(0).textContent = `컴퓨터: ${computerId}`;
      row.insertCell(1).textContent = stats.count.toLocaleString();
      row.insertCell(2).textContent = percentage + '%';
      row.insertCell(3).textContent = avgTime + 'ms';
    }
  }

  const requestGroupEntries = Object.entries(requestGroupStats);
  for (let i = 0; i < requestGroupEntries.length; i++) {
    const [requestGroupId, stats] = requestGroupEntries[i];
    if (stats.count > 0) {
      const row = tbody.insertRow();
      const percentage = ((stats.count / totalLogs) * 100).toFixed(1);
      const avgTime = stats.count > 0 ? (stats.totalTime / stats.count).toFixed(2) : 0;

      row.insertCell(0).textContent = `요청 그룹: ${requestGroupId}`;
      row.insertCell(1).textContent = stats.count.toLocaleString();
      row.insertCell(2).textContent = percentage + '%';
      row.insertCell(3).textContent = avgTime + 'ms';
    }
  }
}

function displayErrorDetails(logs) {
  const container = document.getElementById('errorDetailsContainer');
  container.innerHTML = '';

  // 실패 로그만 필터링 (최적화된 방식)
  const failLogs = [];
  for (let i = 0; i < logs.length; i++) {
    if (logs[i].status === 'fail') {
      failLogs.push(logs[i]);
    }
  }

  if (failLogs.length === 0) {
    container.innerHTML = '<div class="error-card"><h4>실패 로그가 없습니다</h4></div>';
    return;
  }

  // 에러 타입별로 그룹화 (최적화된 방식)
  const errorGroups = {};
  for (let i = 0; i < failLogs.length; i++) {
    const log = failLogs[i];
    const errorType = log.error_type || 'unknown';
    if (!errorGroups[errorType]) {
      errorGroups[errorType] = [];
    }
    errorGroups[errorType].push(log);
  }

  // 각 에러 타입별로 상세 정보 표시
  const errorEntries = Object.entries(errorGroups);
  for (let i = 0; i < errorEntries.length; i++) {
    const [errorType, logs] = errorEntries[i];
    const errorCard = document.createElement('div');
    errorCard.className = 'error-card';

    // 평균 응답시간 계산 (최적화된 방식)
    let totalDuration = 0;
    let totalSockets = 0;
    const uniqueIPs = new Set();
    const uniqueSessions = new Set();
    const sessionErrorCounts = {};

    for (let j = 0; j < logs.length; j++) {
      const log = logs[j];
      totalDuration += log.socket_duration_ms || 0;
      totalSockets += log.selected_sockets || log.read_sockets || 0;
      if (log.client_ip) {
        uniqueIPs.add(log.client_ip);
      }
      if (log.session_id) {
        uniqueSessions.add(log.session_id);
        sessionErrorCounts[log.session_id] = (sessionErrorCounts[log.session_id] || 0) + 1;
      }
    }

    const avgDuration = totalDuration / logs.length;
    const avgSockets = totalSockets / logs.length;
    const uniqueIPsCount = uniqueIPs.size;
    const uniqueSessionsCount = uniqueSessions.size;

    // 가장 빈번한 세션 찾기
    let mostFrequentSession = '-';
    let maxSessionErrors = 0;
    const sessionEntries = Object.entries(sessionErrorCounts);
    for (let k = 0; k < sessionEntries.length; k++) {
      const [sessionId, count] = sessionEntries[k];
      if (count > maxSessionErrors) {
        maxSessionErrors = count;
        mostFrequentSession = shortenSessionId(sessionId);
      }
    }

    // 평균 세션당 에러 수
    const avgErrorsPerSession = uniqueSessionsCount > 0 ? (logs.length / uniqueSessionsCount).toFixed(2) : 0;

    errorCard.innerHTML = `
            <h4>${errorType} (${logs.length}건)</h4>
            <div class="error-info">
                <div class="error-info-item">
                    <strong>평균 응답시간:</strong> ${avgDuration.toFixed(2)}ms
                </div>
                <div class="error-info-item">
                    <strong>고유 IP 수:</strong> ${uniqueIPsCount}개
                </div>
                <div class="error-info-item">
                    <strong>고유 세션 수:</strong> ${uniqueSessionsCount}개
                </div>
                <div class="error-info-item">
                    <strong>가장 빈번한 세션:</strong> ${mostFrequentSession} (${maxSessionErrors}회)
                </div>
                <div class="error-info-item">
                    <strong>평균 세션당 에러 수:</strong> ${avgErrorsPerSession}회
                </div>
                <div class="error-info-item">
                    <strong>발생 비율:</strong> ${((logs.length / failLogs.length) * 100).toFixed(1)}%
                </div>
                <div class="error-info-item">
                    <strong>평균 소켓 수:</strong> ${avgSockets.toFixed(2)}个
                </div>
            </div>
            <div class="error-message-text">${logs[0].error_message || '에러 메시지 없음'}</div>
        `;

    container.appendChild(errorCard);
  }
}

function createCharts(logs) {
  createTimeChart(logs);
  createMinuteChart(logs);
  createDurationChart(logs);
  createAvgResponseTimeChart(logs);
  createSessionChart(logs);
  createComputerChart(logs);
  createRequestGroupChart(logs);
}

function createTimeChart(logs) {
  const ctx = document.getElementById('timeChart').getContext('2d');

  if (timeChart) {
    timeChart.destroy();
  }

  // 날짜별, 시간별 데이터 그룹화
  const dateTimeData = {};

  // 한 번의 순회로 날짜별, 시간별 데이터 수집
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (log.timestamp) {
      const [date, time] = log.timestamp.split(' ');
      const hour = time.split(':')[0];
      const dateKey = date;
      const timeKey = `${dateKey} ${hour}:00`;

      if (!dateTimeData[timeKey]) {
        dateTimeData[timeKey] = { success: 0, fail: 0 };
      }
      if (log.status === 'success') {
        dateTimeData[timeKey].success++;
      } else {
        dateTimeData[timeKey].fail++;
      }
    }
  }

  // 시간순으로 정렬
  const sortedTimeKeys = Object.keys(dateTimeData).sort();
  const successData = sortedTimeKeys.map(key => dateTimeData[key].success);
  const failData = sortedTimeKeys.map(key => dateTimeData[key].fail);

  // 라벨 포맷팅 (날짜와 시간을 함께 표시)
  const labels = sortedTimeKeys.map(key => {
    const [date, time] = key.split(' ');
    const [hour] = time.split(':');
    return `${date} ${hour}시`;
  });

  timeChart = new Chart(ctx, {
    type: chartTypes.time,
    data: {
      labels: labels,
      datasets: [
        {
          label: '성공 요청',
          data: successData,
          backgroundColor: chartTypes.time === 'bar' ? 'rgba(40, 167, 69, 0.8)' : 'rgba(40, 167, 69, 0.2)',
          borderColor: 'rgba(40, 167, 69, 1)',
          borderWidth: chartTypes.time === 'bar' ? 1 : 3,
          fill: chartTypes.time === 'line',
          tension: chartTypes.time === 'line' ? 0.4 : 0
        },
        {
          label: '실패 요청',
          data: failData,
          backgroundColor: chartTypes.time === 'bar' ? 'rgba(220, 53, 69, 0.8)' : 'rgba(220, 53, 69, 0.2)',
          borderColor: 'rgba(220, 53, 69, 1)',
          borderWidth: chartTypes.time === 'bar' ? 1 : 3,
          fill: chartTypes.time === 'line',
          tension: chartTypes.time === 'line' ? 0.4 : 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: '요청 수'
          }
        },
        x: {
          title: {
            display: true,
            text: '날짜 및 시간'
          },
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: '날짜별 시간대 요청 분포'
        },
        tooltip: {
          callbacks: {
            afterBody: function (context) {
              const dataIndex = context[0].dataIndex;
              const timeKey = sortedTimeKeys[dataIndex];
              const [date, time] = timeKey.split(' ');
              const hour = time.split(':')[0];

              // 해당 시간대의 분별 분포 계산
              const minuteCounts = {};
              for (let i = 0; i < logs.length; i++) {
                const log = logs[i];
                if (log.timestamp) {
                  const [logDate, logTime] = log.timestamp.split(' ');
                  const [logHour, minute] = logTime.split(':');
                  if (logDate === date && logHour === hour) {
                    minuteCounts[minute] = (minuteCounts[minute] || 0) + 1;
                  }
                }
              }

              const topMinutes = Object.entries(minuteCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5);

              if (topMinutes.length > 0) {
                return ['', '상위 분별 분포:'] +
                  topMinutes.map(([minute, count]) => `${minute}분: ${count}건`);
              }
              return '';
            }
          }
        }
      }
    }
  });
}

function createMinuteChart(logs) {
  const ctx = document.getElementById('minuteChart').getContext('2d');

  if (minuteChart) {
    minuteChart.destroy();
  }

  // 날짜별, 분별 데이터 그룹화
  const dateMinuteData = {};

  // 한 번의 순회로 날짜별, 분별 데이터 수집
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (log.timestamp) {
      const [date, time] = log.timestamp.split(' ');
      const [hour, minute] = time.split(':');
      const timeKey = `${date} ${hour}:${minute}`;
      if (!dateMinuteData[timeKey]) {
        dateMinuteData[timeKey] = { success: 0, fail: 0 };
      }
      if (log.status === 'success') {
        dateMinuteData[timeKey].success++;
      } else {
        dateMinuteData[timeKey].fail++;
      }
    }
  }

  // 분별 차트 데이터 (상위 20개만 표시)
  const sortedMinutes = Object.entries(dateMinuteData)
    .sort(([, a], [, b]) => (b.success + b.fail) - (a.success + a.fail))
    .slice(0, 20);
  const minuteLabels = sortedMinutes.map(([time,]) => {
    const [date, timeOnly] = time.split(' ');
    return `${date} ${timeOnly}`;
  });
  const successData = sortedMinutes.map(([, data]) => data.success);
  const failData = sortedMinutes.map(([, data]) => data.fail);

  minuteChart = new Chart(ctx, {
    type: chartTypes.minute,
    data: {
      labels: minuteLabels,
      datasets: [
        {
          label: '성공 요청',
          data: successData,
          backgroundColor: chartTypes.minute === 'bar' ? 'rgba(40, 167, 69, 0.8)' : 'rgba(40, 167, 69, 0.2)',
          borderColor: 'rgba(40, 167, 69, 1)',
          borderWidth: chartTypes.minute === 'bar' ? 1 : 3,
          fill: chartTypes.minute === 'line',
          tension: chartTypes.minute === 'line' ? 0.4 : 0
        },
        {
          label: '실패 요청',
          data: failData,
          backgroundColor: chartTypes.minute === 'bar' ? 'rgba(220, 53, 69, 0.8)' : 'rgba(220, 53, 69, 0.2)',
          borderColor: 'rgba(220, 53, 69, 1)',
          borderWidth: chartTypes.minute === 'bar' ? 1 : 3,
          fill: chartTypes.minute === 'line',
          tension: chartTypes.minute === 'line' ? 0.4 : 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: '요청 수'
          }
        },
        x: {
          title: {
            display: true,
            text: '날짜 및 시간'
          },
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: '날짜별 분별 요청 분포 (상위 20개)'
        },
        tooltip: {
          callbacks: {
            afterBody: function (context) {
              const dataIndex = context[0].dataIndex;
              const timeKey = sortedMinutes[dataIndex][0];
              const [date, time] = timeKey.split(' ');
              const [hour, minute] = time.split(':');

              // 해당 시간의 상세 정보 계산
              const totalRequests = dateMinuteData[timeKey].success + dateMinuteData[timeKey].fail;
              const successRate = ((dateMinuteData[timeKey].success / totalRequests) * 100).toFixed(1);

              return [
                '',
                `총 요청: ${totalRequests}건`,
                `성공률: ${successRate}%`
              ];
            }
          }
        }
      }
    }
  });
}

function createDurationChart(logs) {
  const ctx = document.getElementById('durationChart').getContext('2d');

  if (durationChart) {
    durationChart.destroy();
  }

  // 응답시간 구간별 분류
  const durationRanges = [
    { min: 0, max: 100, label: '0-100ms' },
    { min: 100, max: 500, label: '100-500ms' },
    { min: 500, max: 1000, label: '500ms-1s' },
    { min: 1000, max: 5000, label: '1s-5s' },
    { min: 5000, max: Infinity, label: '5s 이상' }
  ];

  const durationData = {};
  durationRanges.forEach(range => {
    durationData[range.label] = { success: 0, fail: 0 };
  });

  // 한 번의 순회로 응답시간 데이터 수집
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const duration = log.socket_duration_ms || 0;
    const range = durationRanges.find(r => duration >= r.min && duration < r.max);
    if (range) {
      if (log.status === 'success') {
        durationData[range.label].success++;
      } else {
        durationData[range.label].fail++;
      }
    }
  }

  const labels = Object.keys(durationData);
  const successData = labels.map(label => durationData[label].success);
  const failData = labels.map(label => durationData[label].fail);

  durationChart = new Chart(ctx, {
    type: chartTypes.duration,
    data: {
      labels: labels,
      datasets: [
        {
          label: '성공 요청',
          data: successData,
          backgroundColor: chartTypes.duration === 'bar' ? 'rgba(40, 167, 69, 0.8)' : 'rgba(40, 167, 69, 0.2)',
          borderColor: 'rgba(40, 167, 69, 1)',
          borderWidth: chartTypes.duration === 'bar' ? 1 : 3,
          fill: chartTypes.duration === 'line',
          tension: chartTypes.duration === 'line' ? 0.4 : 0
        },
        {
          label: '실패 요청',
          data: failData,
          backgroundColor: chartTypes.duration === 'bar' ? 'rgba(220, 53, 69, 0.8)' : 'rgba(220, 53, 69, 0.2)',
          borderColor: 'rgba(220, 53, 69, 1)',
          borderWidth: chartTypes.duration === 'bar' ? 1 : 3,
          fill: chartTypes.duration === 'line',
          tension: chartTypes.duration === 'line' ? 0.4 : 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: '요청 수'
          }
        },
        x: {
          title: {
            display: true,
            text: '응답시간 구간'
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: '응답시간별 요청 분포'
        }
      }
    }
  });
}

function createAvgResponseTimeChart(logs) {
  const ctx = document.getElementById('avgResponseTimeChart').getContext('2d');

  if (avgResponseTimeChart) {
    avgResponseTimeChart.destroy();
  }

  // 시간대별 평균 응답시간 계산 - 최적화된 방식
  const hourlyAvgResponseTime = {};
  const hourlyCounts = {};

  // 한 번의 순회로 시간대별 응답시간 수집
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (log.timestamp && log.socket_duration_ms) {
      const hour = log.timestamp.split(' ')[1].split(':')[0];
      if (!hourlyAvgResponseTime[hour]) {
        hourlyAvgResponseTime[hour] = 0;
        hourlyCounts[hour] = 0;
      }
      hourlyAvgResponseTime[hour] += log.socket_duration_ms;
      hourlyCounts[hour]++;
    }
  }

  // 평균 계산
  const hours = Object.keys(hourlyAvgResponseTime).sort();
  const avgResponseTimeData = hours.map(hour =>
    hourlyAvgResponseTime[hour] / hourlyCounts[hour]
  );

  avgResponseTimeChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: hours.map(h => h + '시'),
      datasets: [
        {
          label: '평균 응답시간',
          data: avgResponseTimeData,
          backgroundColor: 'rgba(153, 102, 255, 0.2)',
          borderColor: 'rgba(153, 102, 255, 1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: '평균 응답시간 (ms)'
          }
        },
        x: {
          title: {
            display: true,
            text: '시간'
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: '시간대별 평균 응답시간'
        }
      }
    }
  });
}

function createSessionChart(logs) {
  const ctx = document.getElementById('sessionChart').getContext('2d');

  if (sessionChart) {
    sessionChart.destroy();
  }

  // 세션별 요청 수 계산 (짧은 ID 사용)
  const sessionRequestCounts = {};
  const sessionIdMapping = {}; // 원본 ID와 짧은 ID 매핑

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (log.session_id) {
      const shortId = shortenSessionId(log.session_id);
      sessionRequestCounts[shortId] = (sessionRequestCounts[shortId] || 0) + 1;
      sessionIdMapping[shortId] = log.session_id; // 원본 ID 저장
    }
  }

  // 상위 10개 세션 추출
  const sortedSessions = Object.entries(sessionRequestCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  const sessionLabels = sortedSessions.map(([shortId,]) => shortId);
  const sessionData = sortedSessions.map(([, count]) => count);

  const chartType = chartTypes.session || 'bar';

  sessionChart = new Chart(ctx, {
    type: chartType,
    data: {
      labels: sessionLabels,
      datasets: [
        {
          label: '세션별 요청 수',
          data: sessionData,
          backgroundColor: chartType === 'bar' ? 'rgba(103, 126, 234, 0.8)' :
            chartType === 'line' ? 'rgba(103, 126, 234, 0.2)' :
              generateColors(sessionData.length),
          borderColor: chartType === 'pie' ? generateColors(sessionData.length) : 'rgba(103, 126, 234, 1)',
          borderWidth: chartType === 'bar' ? 1 : 3,
          fill: chartType === 'line',
          tension: chartType === 'line' ? 0.4 : 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: chartType === 'pie' ? {} : {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: '요청 수'
          }
        },
        x: {
          title: {
            display: true,
            text: '세션 ID (축약형)'
          },
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: '세션별 요청 분포 (상위 10개)'
        },
        tooltip: {
          callbacks: {
            afterLabel: function (context) {
              const shortId = context.label;
              const originalId = sessionIdMapping[shortId];
              if (originalId && originalId !== shortId) {
                return `원본 ID: ${originalId}`;
              }
              return '';
            }
          }
        }
      }
    }
  });
}

function createComputerChart(logs) {
  const ctx = document.getElementById('computerChart').getContext('2d');

  if (computerChart) {
    computerChart.destroy();
  }

  // 컴퓨터별 요청 수 계산 (짧은 ID 사용)
  const computerRequestCounts = {};
  const computerIdMapping = {}; // 원본 ID와 짧은 ID 매핑

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (log.computer_id) {
      const shortId = shortenComputerId(log.computer_id);
      computerRequestCounts[shortId] = (computerRequestCounts[shortId] || 0) + 1;
      computerIdMapping[shortId] = log.computer_id; // 원본 ID 저장
    }
  }

  // 상위 10개 컴퓨터 추출
  const sortedComputers = Object.entries(computerRequestCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  const computerLabels = sortedComputers.map(([shortId,]) => shortId);
  const computerData = sortedComputers.map(([, count]) => count);

  const chartType = chartTypes.computer || 'bar';

  computerChart = new Chart(ctx, {
    type: chartType,
    data: {
      labels: computerLabels,
      datasets: [
        {
          label: '컴퓨터별 요청 수',
          data: computerData,
          backgroundColor: chartType === 'bar' ? 'rgba(255, 159, 64, 0.8)' :
            chartType === 'line' ? 'rgba(255, 159, 64, 0.2)' :
              generateColors(computerData.length),
          borderColor: chartType === 'pie' ? generateColors(computerData.length) : 'rgba(255, 159, 64, 1)',
          borderWidth: chartType === 'bar' ? 1 : 3,
          fill: chartType === 'line',
          tension: chartType === 'line' ? 0.4 : 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: chartType === 'pie' ? {} : {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: '요청 수'
          }
        },
        x: {
          title: {
            display: true,
            text: '컴퓨터 ID (축약형)'
          },
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: '컴퓨터별 요청 분포 (상위 10개)'
        },
        tooltip: {
          callbacks: {
            afterLabel: function (context) {
              const shortId = context.label;
              const originalId = computerIdMapping[shortId];
              if (originalId && originalId !== shortId) {
                return `원본 ID: ${originalId}`;
              }
              return '';
            }
          }
        }
      }
    }
  });
}

function createRequestGroupChart(logs) {
  const ctx = document.getElementById('requestGroupChart').getContext('2d');

  if (requestGroupChart) {
    requestGroupChart.destroy();
  }

  // 요청 그룹별 요청 수 계산 (짧은 ID 사용)
  const requestGroupRequestCounts = {};
  const requestGroupIdMapping = {}; // 원본 ID와 짧은 ID 매핑

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    if (log.request_group_id) {
      const shortId = shortenRequestGroupId(log.request_group_id);
      requestGroupRequestCounts[shortId] = (requestGroupRequestCounts[shortId] || 0) + 1;
      requestGroupIdMapping[shortId] = log.request_group_id; // 원본 ID 저장
    }
  }

  // 상위 10개 요청 그룹 추출
  const sortedRequestGroups = Object.entries(requestGroupRequestCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  const requestGroupLabels = sortedRequestGroups.map(([shortId,]) => shortId);
  const requestGroupData = sortedRequestGroups.map(([, count]) => count);

  const chartType = chartTypes.requestGroup || 'bar';

  requestGroupChart = new Chart(ctx, {
    type: chartType,
    data: {
      labels: requestGroupLabels,
      datasets: [
        {
          label: '요청 그룹별 요청 수',
          data: requestGroupData,
          backgroundColor: chartType === 'bar' ? 'rgba(23, 162, 184, 0.8)' :
            chartType === 'line' ? 'rgba(23, 162, 184, 0.2)' :
              generateColors(requestGroupData.length),
          borderColor: chartType === 'pie' ? generateColors(requestGroupData.length) : 'rgba(23, 162, 184, 1)',
          borderWidth: chartType === 'bar' ? 1 : 3,
          fill: chartType === 'line',
          tension: chartType === 'line' ? 0.4 : 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: chartType === 'pie' ? {} : {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: '요청 수'
          }
        },
        x: {
          title: {
            display: true,
            text: '요청 그룹 ID (축약형)'
          },
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: '요청 그룹별 요청 분포 (상위 10개)'
        },
        tooltip: {
          callbacks: {
            afterLabel: function (context) {
              const shortId = context.label;
              const originalId = requestGroupIdMapping[shortId];
              if (originalId && originalId !== shortId) {
                return `원본 ID: ${originalId}`;
              }
              return '';
            }
          }
        }
      }
    }
  });
}

function setupChartControls() {
  const chartControlsContainer = document.getElementById('chartControlsContainer');
  if (chartControlsContainer) {
    chartControlsContainer.style.display = 'block';
  }
}

// 색상 생성 함수 (파이 차트용)
function generateColors(count) {
  const colors = [
    'rgba(255, 99, 132, 0.8)',
    'rgba(54, 162, 235, 0.8)',
    'rgba(255, 206, 86, 0.8)',
    'rgba(75, 192, 192, 0.8)',
    'rgba(153, 102, 255, 0.8)',
    'rgba(255, 159, 64, 0.8)',
    'rgba(199, 199, 199, 0.8)',
    'rgba(83, 102, 255, 0.8)',
    'rgba(78, 252, 3, 0.8)',
    'rgba(252, 3, 244, 0.8)',
    'rgba(3, 252, 198, 0.8)',
    'rgba(252, 161, 3, 0.8)',
    'rgba(252, 3, 3, 0.8)',
    'rgba(3, 3, 252, 0.8)',
    'rgba(252, 252, 3, 0.8)',
    'rgba(3, 252, 3, 0.8)',
    'rgba(252, 3, 161, 0.8)',
    'rgba(161, 3, 252, 0.8)',
    'rgba(3, 161, 252, 0.8)',
    'rgba(252, 198, 3, 0.8)'
  ];

  const result = [];
  for (let i = 0; i < count; i++) {
    result.push(colors[i % colors.length]);
  }
  return result;
}

function updateChartType(chartName) {
  const selectElement = document.getElementById(chartName + 'ChartType');
  chartTypes[chartName] = selectElement.value;

  // 해당 차트만 다시 생성
  if (filteredLogs.length > 0) {
    switch (chartName) {
      case 'time':
        createTimeChart(filteredLogs);
        break;
      case 'minute':
        createMinuteChart(filteredLogs);
        break;
      case 'duration':
        createDurationChart(filteredLogs);
        break;
      case 'session':
        createSessionChart(filteredLogs);
        break;
      case 'computer':
        createComputerChart(filteredLogs);
        break;
      case 'requestGroup':
        createRequestGroupChart(filteredLogs);
        break;
    }
  }
}

// 파일 선택 이벤트 리스너
document.addEventListener('DOMContentLoaded', function () {
  const fileInput = document.getElementById('logFile');
  const selectedFileName = document.getElementById('selectedFileName');
  const analyzeBtn = document.getElementById('analyzeBtn');

  fileInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (file) {
      selectedFile = file;
      selectedFileName.textContent = `선택된 파일: ${file.name}`;
      analyzeBtn.disabled = false;
      clearError();
    } else {
      selectedFile = null;
      selectedFileName.textContent = '파일을 선택해주세요';
      analyzeBtn.disabled = true;
    }
  });
});

// 전체 분별 분포 모달 관련 함수들
function showFullMinuteDistribution() {
  if (filteredLogs.length === 0) {
    showError('분석할 로그 데이터가 없습니다.');
    return;
  }

  const modal = document.getElementById('fullMinuteModal');
  modal.style.display = 'block';

  // 모달창이 열릴 때 기본 차트 타입 설정
  const minuteChartTypeSelect = document.getElementById('modalMinuteChartType');
  minuteChartTypeSelect.value = modalChartType || 'bar';

  // modalChartType을 현재 선택된 값으로 업데이트
  modalChartType = minuteChartTypeSelect.value;

  // 모달이 표시된 후 차트 생성
  setTimeout(() => {
    createFullMinuteChart();
  }, 100);
}

function closeFullMinuteModal() {
  const modal = document.getElementById('fullMinuteModal');
  modal.style.display = 'none';

  // 차트 정리
  if (fullMinuteChart) {
    fullMinuteChart.destroy();
    fullMinuteChart = null;
  }
}

function createFullMinuteChart() {
  const ctx = document.getElementById('fullMinuteChart').getContext('2d');

  if (fullMinuteChart) {
    fullMinuteChart.destroy();
  }

  const filterType = document.getElementById('minuteFilterType').value;
  const sortType = document.getElementById('minuteSortType').value;
  const chartType = document.getElementById('modalMinuteChartType').value;
  const startDate = document.getElementById('modalStartDate').value;
  const endDate = document.getElementById('modalEndDate').value;

  // 모달창 차트 타입 업데이트
  modalChartType = chartType;

  // 날짜별, 분별 데이터 그룹화
  const dateMinuteData = {};

  // 한 번의 순회로 날짜별, 분별 데이터 수집
  for (let i = 0; i < filteredLogs.length; i++) {
    const log = filteredLogs[i];
    if (log.timestamp) {
      const [date, time] = log.timestamp.split(' ');
      const [hour, minute] = time.split(':');
      const timeKey = `${date} ${hour}:${minute}`;

      // 날짜 필터 적용
      if (startDate || endDate) {
        let dateMatch = true;
        if (startDate && endDate) {
          dateMatch = date >= startDate && date <= endDate;
        } else if (startDate) {
          dateMatch = date >= startDate;
        } else if (endDate) {
          dateMatch = date <= endDate;
        }
        if (!dateMatch) continue;
      }

      if (!dateMinuteData[timeKey]) {
        dateMinuteData[timeKey] = { success: 0, fail: 0, total: 0 };
      }

      if (log.status === 'success') {
        dateMinuteData[timeKey].success++;
      } else {
        dateMinuteData[timeKey].fail++;
      }
      dateMinuteData[timeKey].total++;
    }
  }

  // 필터 적용
  let filteredMinuteData = {};
  const minuteEntries = Object.entries(dateMinuteData);
  for (let i = 0; i < minuteEntries.length; i++) {
    const [time, data] = minuteEntries[i];
    if (filterType === 'all') {
      filteredMinuteData[time] = data;
    } else if (filterType === 'success' && data.success > 0) {
      filteredMinuteData[time] = { success: data.success, fail: 0, total: data.success };
    } else if (filterType === 'fail' && data.fail > 0) {
      filteredMinuteData[time] = { success: 0, fail: data.fail, total: data.fail };
    }
  }

  // 정렬
  let sortedMinutes;
  if (sortType === 'count') {
    sortedMinutes = Object.entries(filteredMinuteData)
      .sort(([, a], [, b]) => b.total - a.total);
  } else {
    sortedMinutes = Object.entries(filteredMinuteData)
      .sort(([a], [b]) => a.localeCompare(b));
  }

  const minuteLabels = sortedMinutes.map(([time,]) => {
    const [date, timeOnly] = time.split(' ');
    return `${date} ${timeOnly}`;
  });
  const successData = sortedMinutes.map(([, data]) => data.success);
  const failData = sortedMinutes.map(([, data]) => data.fail);

  // 통계 업데이트
  updateMinuteStats(filteredMinuteData);

  fullMinuteChart = new Chart(ctx, {
    type: modalChartType || 'bar',
    data: {
      labels: minuteLabels,
      datasets: [
        {
          label: '성공 요청',
          data: successData,
          backgroundColor: modalChartType === 'bar' ? 'rgba(40, 167, 69, 0.8)' : 'rgba(40, 167, 69, 0.2)',
          borderColor: 'rgba(40, 167, 69, 1)',
          borderWidth: modalChartType === 'bar' ? 1 : 3,
          fill: modalChartType === 'line',
          tension: modalChartType === 'line' ? 0.4 : 0
        },
        {
          label: '실패 요청',
          data: failData,
          backgroundColor: modalChartType === 'bar' ? 'rgba(220, 53, 69, 0.8)' : 'rgba(220, 53, 69, 0.2)',
          borderColor: 'rgba(220, 53, 69, 1)',
          borderWidth: modalChartType === 'bar' ? 1 : 3,
          fill: modalChartType === 'line',
          tension: modalChartType === 'line' ? 0.4 : 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: '요청 수'
          }
        },
        x: {
          title: {
            display: true,
            text: '날짜 및 시간 (시:분)'
          },
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: '전체 날짜별 분별 요청 분포'
        },
        tooltip: {
          callbacks: {
            afterBody: function (context) {
              const dataIndex = context[0].dataIndex;
              const timeKey = sortedMinutes[dataIndex][0];
              const [date, time] = timeKey.split(' ');
              const [hour, minute] = time.split(':');

              // 해당 시간의 상세 정보 계산
              const totalRequests = filteredMinuteData[timeKey].success + filteredMinuteData[timeKey].fail;
              const successRate = ((filteredMinuteData[timeKey].success / totalRequests) * 100).toFixed(1);

              return [
                '',
                `총 요청: ${totalRequests}건`,
                `성공률: ${successRate}%`
              ];
            }
          }
        }
      },
      zoom: {
        pan: {
          enabled: true,
          mode: 'xy'
        },
        zoom: {
          wheel: {
            enabled: true
          },
          pinch: {
            enabled: true
          },
          mode: 'xy',
          drag: {
            enabled: isZoomMode && zoomMode === 'drag',
            backgroundColor: 'rgba(103, 126, 234, 0.3)',
            borderColor: 'rgba(103, 126, 234, 0.8)',
            borderWidth: 1
          }
        }
      }
    }
  });

  // 줌 이벤트 리스너 추가
  fullMinuteChart.canvas.addEventListener('mousedown', handleZoomStart);
  fullMinuteChart.canvas.addEventListener('mousemove', handleZoomMove);
  fullMinuteChart.canvas.addEventListener('mouseup', handleZoomEnd);

  // 줌 상태 업데이트
  updateZoomStatus();
}

function updateFullMinuteChart() {
  // 기존 차트가 있으면 제거
  if (fullMinuteChart) {
    fullMinuteChart.destroy();
    fullMinuteChart = null;
  }

  // 모달이 표시되어 있는지 확인
  const modal = document.getElementById('fullMinuteModal');
  if (modal.style.display === 'block') {
    // 새 차트 생성
    createFullMinuteChart();
  }
}

function updateMinuteStats(minuteData) {
  const totalMinutes = Object.keys(minuteData).length;

  // 통계 계산 최적화
  let allRequests = 0;
  let totalSuccess = 0;
  let totalFail = 0;
  const requestCounts = [];

  const minuteEntries = Object.values(minuteData);
  for (let i = 0; i < minuteEntries.length; i++) {
    const data = minuteEntries[i];
    allRequests += data.total;
    totalSuccess += data.success;
    totalFail += data.fail;
    requestCounts.push(data.total);
  }

  const avgRequestsPerMinute = totalMinutes > 0 ? (allRequests / totalMinutes).toFixed(1) : 0;

  // 최대/최소 요청 수 (최적화된 방식)
  let maxRequestsPerMinute = 0;
  let minRequestsPerMinute = 0;
  if (requestCounts.length > 0) {
    maxRequestsPerMinute = requestCounts[0];
    minRequestsPerMinute = requestCounts[0];

    for (let i = 1; i < requestCounts.length; i++) {
      const count = requestCounts[i];
      if (count > maxRequestsPerMinute) maxRequestsPerMinute = count;
      if (count < minRequestsPerMinute) minRequestsPerMinute = count;
    }
  }

  // 성공률/실패률 계산
  const successRate = allRequests > 0 ? ((totalSuccess / allRequests) * 100).toFixed(1) : 0;
  const failRate = allRequests > 0 ? ((totalFail / allRequests) * 100).toFixed(1) : 0;

  // 중간값 계산 (최적화된 방식)
  let medianRequestsPerMinute = 0;
  if (requestCounts.length > 0) {
    const sortedRequests = requestCounts.slice().sort((a, b) => a - b);
    const mid = Math.floor(sortedRequests.length / 2);

    if (sortedRequests.length % 2 === 0) {
      medianRequestsPerMinute = (sortedRequests[mid - 1] + sortedRequests[mid]) / 2;
    } else {
      medianRequestsPerMinute = sortedRequests[mid];
    }
  }

  // DOM 업데이트
  document.getElementById('totalMinutes').textContent = totalMinutes.toLocaleString();
  document.getElementById('avgRequestsPerMinute').textContent = avgRequestsPerMinute;
  document.getElementById('maxRequestsPerMinute').textContent = maxRequestsPerMinute.toLocaleString();

  // 추가 통계 정보 업데이트
  updateAdditionalMinuteStats({
    totalRequests: allRequests,
    totalSuccess: totalSuccess,
    totalFail: totalFail,
    successRate: successRate,
    failRate: failRate,
    minRequestsPerMinute: minRequestsPerMinute,
    medianRequestsPerMinute: medianRequestsPerMinute
  });
}

function updateAdditionalMinuteStats(stats) {
  document.getElementById('totalRequests').textContent = stats.totalRequests.toLocaleString();
  document.getElementById('totalSuccess').textContent = stats.totalSuccess.toLocaleString();
  document.getElementById('totalFail').textContent = stats.totalFail.toLocaleString();
  document.getElementById('successRate').textContent = stats.successRate + '%';
  document.getElementById('failRate').textContent = stats.failRate + '%';
  document.getElementById('minRequestsPerMinute').textContent = stats.minRequestsPerMinute.toLocaleString();
  document.getElementById('medianRequestsPerMinute').textContent = stats.medianRequestsPerMinute.toLocaleString();
}

// 모달 외부 클릭 시 닫기
window.onclick = function (event) {
  const minuteModal = document.getElementById('fullMinuteModal');
  const sessionModal = document.getElementById('fullSessionModal');
  const computerModal = document.getElementById('fullComputerModal');
  const requestGroupModal = document.getElementById('fullRequestGroupModal');

  if (event.target === minuteModal) {
    closeFullMinuteModal();
  } else if (event.target === sessionModal) {
    closeFullSessionModal();
  } else if (event.target === computerModal) {
    closeFullComputerModal();
  } else if (event.target === requestGroupModal) {
    closeFullRequestGroupModal();
  }
}

// 줌 기능 관련 함수들
function toggleZoomMode() {
  isZoomMode = !isZoomMode;
  zoomMode = isZoomMode ? 'drag' : 'pan';

  const zoomModeIcon = document.getElementById('zoomModeIcon');
  const zoomModeText = document.getElementById('zoomModeText');

  if (isZoomMode) {
    zoomModeIcon.textContent = '🔍';
    zoomModeText.textContent = '줌';
  } else {
    zoomModeIcon.textContent = '📏';
    zoomModeText.textContent = '드래그';
  }

  if (fullMinuteChart) {
    // 줌 설정 업데이트
    fullMinuteChart.options.plugins.zoom.zoom.drag.enabled = isZoomMode && zoomMode === 'drag';
    fullMinuteChart.update();
  }

  updateZoomStatus();
}

function resetZoom() {
  if (fullMinuteChart) {
    fullMinuteChart.resetZoom();
    updateZoomStatus();
  }
}

function updateZoomStatus() {
  const zoomStatus = document.getElementById('zoomStatus');
  if (!fullMinuteChart) {
    zoomStatus.textContent = '줌: 전체';
    return;
  }

  const zoom = fullMinuteChart.getZoomLevel();
  if (zoom === 1) {
    zoomStatus.textContent = '줌: 전체';
  } else {
    zoomStatus.textContent = `줌: ${(zoom * 100).toFixed(0)}%`;
  }
}

// 줌 이벤트 핸들러들
let isDragging = false;
let startX = 0;
let startY = 0;

function handleZoomStart(event) {
  if (!isZoomMode) return;

  isDragging = true;
  const rect = fullMinuteChart.canvas.getBoundingClientRect();
  startX = event.clientX - rect.left;
  startY = event.clientY - rect.top;
}

function handleZoomMove(event) {
  if (!isZoomMode || !isDragging) return;

  const rect = fullMinuteChart.canvas.getBoundingClientRect();
  const currentX = event.clientX - rect.left;
  const currentY = event.clientY - rect.top;

  // 드래그 영역 표시 (선택적)
  // 실제 줌은 Chart.js 플러그인이 처리
}

function handleZoomEnd(event) {
  if (!isZoomMode || !isDragging) return;

  isDragging = false;

  // 줌 상태 업데이트
  setTimeout(() => {
    updateZoomStatus();
  }, 100);
}

function applyAdvancedFilter() {
  const sessionFilter = document.getElementById('sessionFilter').value;
  const computerFilter = document.getElementById('computerFilter').value;
  const requestGroupFilter = document.getElementById('requestGroupFilter').value;
  const logTypeFilter = document.getElementById('logTypeFilter').value;

  // 필터링 최적화
  filteredLogs = [];
  for (let i = 0; i < allLogs.length; i++) {
    const log = allLogs[i];

    // 로그 타입 필터 적용
    if (logTypeFilter !== 'all' && log.status !== logTypeFilter) {
      continue;
    }

    // 세션 필터 적용 (짧은 ID 사용)
    if (sessionFilter) {
      const shortSessionId = shortenSessionId(log.session_id);
      if (shortSessionId !== sessionFilter) {
        continue;
      }
    }

    // 컴퓨터 필터 적용 (짧은 ID 사용)
    if (computerFilter) {
      const shortComputerId = shortenComputerId(log.computer_id);
      if (shortComputerId !== computerFilter) {
        continue;
      }
    }

    // 요청 그룹 필터 적용 (짧은 ID 사용)
    if (requestGroupFilter) {
      const shortRequestGroupId = shortenRequestGroupId(log.request_group_id);
      if (shortRequestGroupId !== requestGroupFilter) {
        continue;
      }
    }

    filteredLogs.push(log);
  }

  // 필터링된 데이터로 차트와 통계 업데이트
  displayStats(filteredLogs);
  createCharts(filteredLogs);
  displayDetailedStats(filteredLogs);
  displayErrorDetails(filteredLogs);
}

function clearAdvancedFilter() {
  document.getElementById('sessionFilter').value = '';
  document.getElementById('computerFilter').value = '';
  document.getElementById('requestGroupFilter').value = '';
  applyLogTypeFilter(); // 로그 타입 필터만 적용
}

function showFilterTab(tabName) {
  // 모든 탭 버튼에서 active 클래스 제거
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => btn.classList.remove('active'));

  // 모든 탭 콘텐츠 숨기기
  const tabContents = document.querySelectorAll('.filter-tab-content');
  tabContents.forEach(content => content.classList.remove('active'));

  // 선택된 탭 버튼에 active 클래스 추가
  const selectedTabBtn = document.querySelector(`[onclick="showFilterTab('${tabName}')"]`);
  if (selectedTabBtn) {
    selectedTabBtn.classList.add('active');
  }

  // 선택된 탭 콘텐츠 표시
  const selectedTabContent = document.getElementById(tabName + 'FilterTab');
  if (selectedTabContent) {
    selectedTabContent.classList.add('active');
  }
}

// 세션별 전체 분포 모달 관련 함수들
function showFullSessionDistribution() {
  if (filteredLogs.length === 0) {
    showError('분석할 로그 데이터가 없습니다.');
    return;
  }

  const modal = document.getElementById('fullSessionModal');
  modal.style.display = 'block';

  // 모달창이 열릴 때 기본 차트 타입 설정
  const sessionChartTypeSelect = document.getElementById('modalSessionChartType');
  sessionChartTypeSelect.value = modalSessionChartType || 'bar';
  modalSessionChartType = sessionChartTypeSelect.value;

  // 모달이 표시된 후 차트 생성
  setTimeout(() => {
    createFullSessionChart();
  }, 100);
}

function closeFullSessionModal() {
  const modal = document.getElementById('fullSessionModal');
  modal.style.display = 'none';

  // 차트 정리
  if (fullSessionChart) {
    fullSessionChart.destroy();
    fullSessionChart = null;
  }
}

function createFullSessionChart() {
  const ctx = document.getElementById('fullSessionChart').getContext('2d');

  if (fullSessionChart) {
    fullSessionChart.destroy();
  }

  const filterType = document.getElementById('sessionFilterType').value;
  const sortType = document.getElementById('sessionSortType').value;
  const chartType = document.getElementById('modalSessionChartType').value;
  const startDate = document.getElementById('sessionModalStartDate').value;
  const endDate = document.getElementById('sessionModalEndDate').value;

  // 모달창 차트 타입 업데이트
  modalSessionChartType = chartType;

  // 세션별 데이터 그룹화 (짧은 ID 사용)
  const sessionData = {};
  const sessionIdMapping = {}; // 원본 ID와 짧은 ID 매핑

  // 한 번의 순회로 세션별 데이터 수집
  for (let i = 0; i < filteredLogs.length; i++) {
    const log = filteredLogs[i];
    if (log.session_id) {
      // 날짜 필터 적용
      if (startDate || endDate) {
        if (!log.timestamp) continue;
        const logDate = log.timestamp.split(' ')[0];
        let dateMatch = true;
        if (startDate && endDate) {
          dateMatch = logDate >= startDate && logDate <= endDate;
        } else if (startDate) {
          dateMatch = logDate >= startDate;
        } else if (endDate) {
          dateMatch = logDate <= endDate;
        }
        if (!dateMatch) continue;
      }

      const shortId = shortenSessionId(log.session_id);
      if (!sessionData[shortId]) {
        sessionData[shortId] = { success: 0, fail: 0, total: 0 };
      }
      sessionIdMapping[shortId] = log.session_id; // 원본 ID 저장

      if (log.status === 'success') {
        sessionData[shortId].success++;
      } else {
        sessionData[shortId].fail++;
      }
      sessionData[shortId].total++;
    }
  }

  // 필터 적용
  let filteredSessionData = {};
  const sessionEntries = Object.entries(sessionData);
  for (let i = 0; i < sessionEntries.length; i++) {
    const [shortId, data] = sessionEntries[i];
    if (filterType === 'all') {
      filteredSessionData[shortId] = data;
    } else if (filterType === 'success' && data.success > 0) {
      filteredSessionData[shortId] = { success: data.success, fail: 0, total: data.success };
    } else if (filterType === 'fail' && data.fail > 0) {
      filteredSessionData[shortId] = { success: 0, fail: data.fail, total: data.fail };
    }
  }

  // 정렬
  let sortedSessions;
  if (sortType === 'count') {
    sortedSessions = Object.entries(filteredSessionData)
      .sort(([, a], [, b]) => b.total - a.total);
  } else {
    sortedSessions = Object.entries(filteredSessionData)
      .sort(([a], [b]) => a.localeCompare(b));
  }

  const sessionLabels = sortedSessions.map(([shortId,]) => shortId);
  const successData = sortedSessions.map(([, data]) => data.success);
  const failData = sortedSessions.map(([, data]) => data.fail);

  // 통계 업데이트
  updateSessionStats(filteredSessionData);

  fullSessionChart = new Chart(ctx, {
    type: modalSessionChartType || 'bar',
    data: {
      labels: sessionLabels,
      datasets: [
        {
          label: '성공 요청',
          data: successData,
          backgroundColor: modalSessionChartType === 'bar' ? 'rgba(40, 167, 69, 0.8)' :
            modalSessionChartType === 'line' ? 'rgba(40, 167, 69, 0.2)' :
              generateColors(successData.length),
          borderColor: modalSessionChartType === 'pie' ? generateColors(successData.length) : 'rgba(40, 167, 69, 1)',
          borderWidth: modalSessionChartType === 'bar' ? 1 : 3,
          fill: modalSessionChartType === 'line',
          tension: modalSessionChartType === 'line' ? 0.4 : 0
        },
        {
          label: '실패 요청',
          data: failData,
          backgroundColor: modalSessionChartType === 'bar' ? 'rgba(220, 53, 69, 0.8)' :
            modalSessionChartType === 'line' ? 'rgba(220, 53, 69, 0.2)' :
              generateColors(failData.length),
          borderColor: modalSessionChartType === 'pie' ? generateColors(failData.length) : 'rgba(220, 53, 69, 1)',
          borderWidth: modalSessionChartType === 'bar' ? 1 : 3,
          fill: modalSessionChartType === 'line',
          tension: modalSessionChartType === 'line' ? 0.4 : 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: modalSessionChartType === 'pie' ? {} : {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: '요청 수'
          }
        },
        x: {
          title: {
            display: true,
            text: '세션 ID (축약형)'
          },
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: '전체 세션별 요청 분포'
        },
        tooltip: {
          callbacks: {
            afterLabel: function (context) {
              const shortId = context.label;
              const originalId = sessionIdMapping[shortId];
              if (originalId && originalId !== shortId) {
                return `원본 ID: ${originalId}`;
              }
              return '';
            }
          }
        }
      }
    }
  });
}

function updateFullSessionChart() {
  // 기존 차트가 있으면 제거
  if (fullSessionChart) {
    fullSessionChart.destroy();
    fullSessionChart = null;
  }

  // 모달이 표시되어 있는지 확인
  const modal = document.getElementById('fullSessionModal');
  if (modal.style.display === 'block') {
    // 새 차트 생성
    createFullSessionChart();
  }
}

function updateSessionStats(sessionData) {
  const totalSessions = Object.keys(sessionData).length;

  // 통계 계산 최적화
  let allRequests = 0;
  let totalSuccess = 0;
  let totalFail = 0;
  const requestCounts = [];

  const sessionEntries = Object.values(sessionData);
  for (let i = 0; i < sessionEntries.length; i++) {
    const data = sessionEntries[i];
    allRequests += data.total;
    totalSuccess += data.success;
    totalFail += data.fail;
    requestCounts.push(data.total);
  }

  const avgRequestsPerSession = totalSessions > 0 ? (allRequests / totalSessions).toFixed(1) : 0;

  // 최대 요청 수 (최적화된 방식)
  let maxRequestsPerSession = 0;
  if (requestCounts.length > 0) {
    maxRequestsPerSession = requestCounts[0];
    for (let i = 1; i < requestCounts.length; i++) {
      const count = requestCounts[i];
      if (count > maxRequestsPerSession) maxRequestsPerSession = count;
    }
  }

  // 성공률/실패률 계산
  const successRate = allRequests > 0 ? ((totalSuccess / allRequests) * 100).toFixed(1) : 0;
  const failRate = allRequests > 0 ? ((totalFail / allRequests) * 100).toFixed(1) : 0;

  // DOM 업데이트
  document.getElementById('totalSessions').textContent = totalSessions.toLocaleString();
  document.getElementById('avgRequestsPerSessionModal').textContent = avgRequestsPerSession;
  document.getElementById('maxRequestsPerSession').textContent = maxRequestsPerSession.toLocaleString();
  document.getElementById('totalSessionRequests').textContent = allRequests.toLocaleString();
  document.getElementById('totalSessionSuccess').textContent = totalSuccess.toLocaleString();
  document.getElementById('totalSessionFail').textContent = totalFail.toLocaleString();
  document.getElementById('sessionSuccessRate').textContent = successRate + '%';
  document.getElementById('sessionFailRate').textContent = failRate + '%';
}

// 컴퓨터별 전체 분포 모달 관련 함수들
function showFullComputerDistribution() {
  if (filteredLogs.length === 0) {
    showError('분석할 로그 데이터가 없습니다.');
    return;
  }

  const modal = document.getElementById('fullComputerModal');
  modal.style.display = 'block';

  // 모달창이 열릴 때 기본 차트 타입 설정
  const computerChartTypeSelect = document.getElementById('modalComputerChartType');
  computerChartTypeSelect.value = modalComputerChartType || 'bar';
  modalComputerChartType = computerChartTypeSelect.value;

  // 모달이 표시된 후 차트 생성
  setTimeout(() => {
    createFullComputerChart();
  }, 100);
}

function closeFullComputerModal() {
  const modal = document.getElementById('fullComputerModal');
  modal.style.display = 'none';

  // 차트 정리
  if (fullComputerChart) {
    fullComputerChart.destroy();
    fullComputerChart = null;
  }
}

function createFullComputerChart() {
  const ctx = document.getElementById('fullComputerChart').getContext('2d');

  if (fullComputerChart) {
    fullComputerChart.destroy();
  }

  const filterType = document.getElementById('computerFilterType').value;
  const sortType = document.getElementById('computerSortType').value;
  const chartType = document.getElementById('modalComputerChartType').value;
  const startDate = document.getElementById('computerModalStartDate').value;
  const endDate = document.getElementById('computerModalEndDate').value;

  // 모달창 차트 타입 업데이트
  modalComputerChartType = chartType;

  // 컴퓨터별 데이터 그룹화 (짧은 ID 사용)
  const computerData = {};
  const computerIdMapping = {}; // 원본 ID와 짧은 ID 매핑

  // 한 번의 순회로 컴퓨터별 데이터 수집
  for (let i = 0; i < filteredLogs.length; i++) {
    const log = filteredLogs[i];
    if (log.computer_id) {
      // 날짜 필터 적용
      if (startDate || endDate) {
        if (!log.timestamp) continue;
        const logDate = log.timestamp.split(' ')[0];
        let dateMatch = true;
        if (startDate && endDate) {
          dateMatch = logDate >= startDate && logDate <= endDate;
        } else if (startDate) {
          dateMatch = logDate >= startDate;
        } else if (endDate) {
          dateMatch = logDate <= endDate;
        }
        if (!dateMatch) continue;
      }

      const shortId = shortenComputerId(log.computer_id);
      if (!computerData[shortId]) {
        computerData[shortId] = { success: 0, fail: 0, total: 0 };
      }
      computerIdMapping[shortId] = log.computer_id; // 원본 ID 저장

      if (log.status === 'success') {
        computerData[shortId].success++;
      } else {
        computerData[shortId].fail++;
      }
      computerData[shortId].total++;
    }
  }

  // 필터 적용
  let filteredComputerData = {};
  const computerEntries = Object.entries(computerData);
  for (let i = 0; i < computerEntries.length; i++) {
    const [shortId, data] = computerEntries[i];
    if (filterType === 'all') {
      filteredComputerData[shortId] = data;
    } else if (filterType === 'success' && data.success > 0) {
      filteredComputerData[shortId] = { success: data.success, fail: 0, total: data.success };
    } else if (filterType === 'fail' && data.fail > 0) {
      filteredComputerData[shortId] = { success: 0, fail: data.fail, total: data.fail };
    }
  }

  // 정렬
  let sortedComputers;
  if (sortType === 'count') {
    sortedComputers = Object.entries(filteredComputerData)
      .sort(([, a], [, b]) => b.total - a.total);
  } else {
    sortedComputers = Object.entries(filteredComputerData)
      .sort(([a], [b]) => a.localeCompare(b));
  }

  const computerLabels = sortedComputers.map(([shortId,]) => shortId);
  const successData = sortedComputers.map(([, data]) => data.success);
  const failData = sortedComputers.map(([, data]) => data.fail);

  // 통계 업데이트
  updateComputerStats(filteredComputerData);

  fullComputerChart = new Chart(ctx, {
    type: modalComputerChartType || 'bar',
    data: {
      labels: computerLabels,
      datasets: [
        {
          label: '성공 요청',
          data: successData,
          backgroundColor: modalComputerChartType === 'bar' ? 'rgba(40, 167, 69, 0.8)' :
            modalComputerChartType === 'line' ? 'rgba(40, 167, 69, 0.2)' :
              generateColors(successData.length),
          borderColor: modalComputerChartType === 'pie' ? generateColors(successData.length) : 'rgba(40, 167, 69, 1)',
          borderWidth: modalComputerChartType === 'bar' ? 1 : 3,
          fill: modalComputerChartType === 'line',
          tension: modalComputerChartType === 'line' ? 0.4 : 0
        },
        {
          label: '실패 요청',
          data: failData,
          backgroundColor: modalComputerChartType === 'bar' ? 'rgba(220, 53, 69, 0.8)' :
            modalComputerChartType === 'line' ? 'rgba(220, 53, 69, 0.2)' :
              generateColors(failData.length),
          borderColor: modalComputerChartType === 'pie' ? generateColors(failData.length) : 'rgba(220, 53, 69, 1)',
          borderWidth: modalComputerChartType === 'bar' ? 1 : 3,
          fill: modalComputerChartType === 'line',
          tension: modalComputerChartType === 'line' ? 0.4 : 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: modalComputerChartType === 'pie' ? {} : {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: '요청 수'
          }
        },
        x: {
          title: {
            display: true,
            text: '컴퓨터 ID (축약형)'
          },
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: '전체 컴퓨터별 요청 분포'
        },
        tooltip: {
          callbacks: {
            afterLabel: function (context) {
              const shortId = context.label;
              const originalId = computerIdMapping[shortId];
              if (originalId && originalId !== shortId) {
                return `원본 ID: ${originalId}`;
              }
              return '';
            }
          }
        }
      }
    }
  });
}

function updateFullComputerChart() {
  // 기존 차트가 있으면 제거
  if (fullComputerChart) {
    fullComputerChart.destroy();
    fullComputerChart = null;
  }

  // 모달이 표시되어 있는지 확인
  const modal = document.getElementById('fullComputerModal');
  if (modal.style.display === 'block') {
    // 새 차트 생성
    createFullComputerChart();
  }
}

function updateComputerStats(computerData) {
  const totalComputers = Object.keys(computerData).length;

  // 통계 계산 최적화
  let allRequests = 0;
  let totalSuccess = 0;
  let totalFail = 0;
  const requestCounts = [];

  const computerEntries = Object.values(computerData);
  for (let i = 0; i < computerEntries.length; i++) {
    const data = computerEntries[i];
    allRequests += data.total;
    totalSuccess += data.success;
    totalFail += data.fail;
    requestCounts.push(data.total);
  }

  const avgRequestsPerComputer = totalComputers > 0 ? (allRequests / totalComputers).toFixed(1) : 0;

  // 최대 요청 수 (최적화된 방식)
  let maxRequestsPerComputer = 0;
  if (requestCounts.length > 0) {
    maxRequestsPerComputer = requestCounts[0];
    for (let i = 1; i < requestCounts.length; i++) {
      const count = requestCounts[i];
      if (count > maxRequestsPerComputer) maxRequestsPerComputer = count;
    }
  }

  // 성공률/실패률 계산
  const successRate = allRequests > 0 ? ((totalSuccess / allRequests) * 100).toFixed(1) : 0;
  const failRate = allRequests > 0 ? ((totalFail / allRequests) * 100).toFixed(1) : 0;

  // DOM 업데이트
  document.getElementById('totalComputers').textContent = totalComputers.toLocaleString();
  document.getElementById('avgRequestsPerComputer').textContent = avgRequestsPerComputer;
  document.getElementById('maxRequestsPerComputer').textContent = maxRequestsPerComputer.toLocaleString();
  document.getElementById('totalComputerRequests').textContent = allRequests.toLocaleString();
  document.getElementById('totalComputerSuccess').textContent = totalSuccess.toLocaleString();
  document.getElementById('totalComputerFail').textContent = totalFail.toLocaleString();
  document.getElementById('computerSuccessRate').textContent = successRate + '%';
  document.getElementById('computerFailRate').textContent = failRate + '%';
}

// 요청 그룹별 전체 분포 모달 관련 함수들
function showFullRequestGroupDistribution() {
  if (filteredLogs.length === 0) {
    showError('분석할 로그 데이터가 없습니다.');
    return;
  }

  const modal = document.getElementById('fullRequestGroupModal');
  modal.style.display = 'block';

  // 모달창이 열릴 때 기본 차트 타입 설정
  const requestGroupChartTypeSelect = document.getElementById('modalRequestGroupChartType');
  requestGroupChartTypeSelect.value = modalRequestGroupChartType || 'bar';
  modalRequestGroupChartType = requestGroupChartTypeSelect.value;

  // 모달이 표시된 후 차트 생성
  setTimeout(() => {
    createFullRequestGroupChart();
  }, 100);
}

function closeFullRequestGroupModal() {
  const modal = document.getElementById('fullRequestGroupModal');
  modal.style.display = 'none';

  // 차트 정리
  if (fullRequestGroupChart) {
    fullRequestGroupChart.destroy();
    fullRequestGroupChart = null;
  }
}

function createFullRequestGroupChart() {
  const ctx = document.getElementById('fullRequestGroupChart').getContext('2d');

  if (fullRequestGroupChart) {
    fullRequestGroupChart.destroy();
  }

  const filterType = document.getElementById('requestGroupFilterType').value;
  const sortType = document.getElementById('requestGroupSortType').value;
  const chartType = document.getElementById('modalRequestGroupChartType').value;
  const startDate = document.getElementById('requestGroupModalStartDate').value;
  const endDate = document.getElementById('requestGroupModalEndDate').value;

  // 모달창 차트 타입 업데이트
  modalRequestGroupChartType = chartType;

  // 요청 그룹별 데이터 그룹화 (짧은 ID 사용)
  const requestGroupData = {};
  const requestGroupIdMapping = {}; // 원본 ID와 짧은 ID 매핑

  // 한 번의 순회로 요청 그룹별 데이터 수집
  for (let i = 0; i < filteredLogs.length; i++) {
    const log = filteredLogs[i];
    if (log.request_group_id) {
      // 날짜 필터 적용
      if (startDate || endDate) {
        if (!log.timestamp) continue;
        const logDate = log.timestamp.split(' ')[0];
        let dateMatch = true;
        if (startDate && endDate) {
          dateMatch = logDate >= startDate && logDate <= endDate;
        } else if (startDate) {
          dateMatch = logDate >= startDate;
        } else if (endDate) {
          dateMatch = logDate <= endDate;
        }
        if (!dateMatch) continue;
      }

      const shortId = shortenRequestGroupId(log.request_group_id);
      if (!requestGroupData[shortId]) {
        requestGroupData[shortId] = { success: 0, fail: 0, total: 0 };
      }
      requestGroupIdMapping[shortId] = log.request_group_id; // 원본 ID 저장

      if (log.status === 'success') {
        requestGroupData[shortId].success++;
      } else {
        requestGroupData[shortId].fail++;
      }
      requestGroupData[shortId].total++;
    }
  }

  // 필터 적용
  let filteredRequestGroupData = {};
  const requestGroupEntries = Object.entries(requestGroupData);
  for (let i = 0; i < requestGroupEntries.length; i++) {
    const [shortId, data] = requestGroupEntries[i];
    if (filterType === 'all') {
      filteredRequestGroupData[shortId] = data;
    } else if (filterType === 'success' && data.success > 0) {
      filteredRequestGroupData[shortId] = { success: data.success, fail: 0, total: data.success };
    } else if (filterType === 'fail' && data.fail > 0) {
      filteredRequestGroupData[shortId] = { success: 0, fail: data.fail, total: data.fail };
    }
  }

  // 정렬
  let sortedRequestGroups;
  if (sortType === 'count') {
    sortedRequestGroups = Object.entries(filteredRequestGroupData)
      .sort(([, a], [, b]) => b.total - a.total);
  } else {
    sortedRequestGroups = Object.entries(filteredRequestGroupData)
      .sort(([a], [b]) => a.localeCompare(b));
  }

  const requestGroupLabels = sortedRequestGroups.map(([shortId,]) => shortId);
  const successData = sortedRequestGroups.map(([, data]) => data.success);
  const failData = sortedRequestGroups.map(([, data]) => data.fail);

  // 통계 업데이트
  updateRequestGroupStats(filteredRequestGroupData);

  fullRequestGroupChart = new Chart(ctx, {
    type: modalRequestGroupChartType || 'bar',
    data: {
      labels: requestGroupLabels,
      datasets: [
        {
          label: '성공 요청',
          data: successData,
          backgroundColor: modalRequestGroupChartType === 'bar' ? 'rgba(40, 167, 69, 0.8)' :
            modalRequestGroupChartType === 'line' ? 'rgba(40, 167, 69, 0.2)' :
              generateColors(successData.length),
          borderColor: modalRequestGroupChartType === 'pie' ? generateColors(successData.length) : 'rgba(40, 167, 69, 1)',
          borderWidth: modalRequestGroupChartType === 'bar' ? 1 : 3,
          fill: modalRequestGroupChartType === 'line',
          tension: modalRequestGroupChartType === 'line' ? 0.4 : 0
        },
        {
          label: '실패 요청',
          data: failData,
          backgroundColor: modalRequestGroupChartType === 'bar' ? 'rgba(220, 53, 69, 0.8)' :
            modalRequestGroupChartType === 'line' ? 'rgba(220, 53, 69, 0.2)' :
              generateColors(failData.length),
          borderColor: modalRequestGroupChartType === 'pie' ? generateColors(failData.length) : 'rgba(220, 53, 69, 1)',
          borderWidth: modalRequestGroupChartType === 'bar' ? 1 : 3,
          fill: modalRequestGroupChartType === 'line',
          tension: modalRequestGroupChartType === 'line' ? 0.4 : 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: modalRequestGroupChartType === 'pie' ? {} : {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: '요청 수'
          }
        },
        x: {
          title: {
            display: true,
            text: '요청 그룹 ID (축약형)'
          },
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        }
      },
      plugins: {
        title: {
          display: true,
          text: '전체 요청 그룹별 요청 분포'
        },
        tooltip: {
          callbacks: {
            afterLabel: function (context) {
              const shortId = context.label;
              const originalId = requestGroupIdMapping[shortId];
              if (originalId && originalId !== shortId) {
                return `원본 ID: ${originalId}`;
              }
              return '';
            }
          }
        }
      }
    }
  });
}

function updateFullRequestGroupChart() {
  // 기존 차트가 있으면 제거
  if (fullRequestGroupChart) {
    fullRequestGroupChart.destroy();
    fullRequestGroupChart = null;
  }

  // 모달이 표시되어 있는지 확인
  const modal = document.getElementById('fullRequestGroupModal');
  if (modal.style.display === 'block') {
    // 새 차트 생성
    createFullRequestGroupChart();
  }
}

function updateRequestGroupStats(requestGroupData) {
  const totalRequestGroups = Object.keys(requestGroupData).length;

  // 통계 계산 최적화
  let allRequests = 0;
  let totalSuccess = 0;
  let totalFail = 0;
  const requestCounts = [];

  const requestGroupEntries = Object.values(requestGroupData);
  for (let i = 0; i < requestGroupEntries.length; i++) {
    const data = requestGroupEntries[i];
    allRequests += data.total;
    totalSuccess += data.success;
    totalFail += data.fail;
    requestCounts.push(data.total);
  }

  const avgRequestsPerRequestGroup = totalRequestGroups > 0 ? (allRequests / totalRequestGroups).toFixed(1) : 0;

  // 최대 요청 수 (최적화된 방식)
  let maxRequestsPerRequestGroup = 0;
  if (requestCounts.length > 0) {
    maxRequestsPerRequestGroup = requestCounts[0];
    for (let i = 1; i < requestCounts.length; i++) {
      const count = requestCounts[i];
      if (count > maxRequestsPerRequestGroup) maxRequestsPerRequestGroup = count;
    }
  }

  // 성공률/실패률 계산
  const successRate = allRequests > 0 ? ((totalSuccess / allRequests) * 100).toFixed(1) : 0;
  const failRate = allRequests > 0 ? ((totalFail / allRequests) * 100).toFixed(1) : 0;

  // DOM 업데이트
  document.getElementById('totalRequestGroups').textContent = totalRequestGroups.toLocaleString();
  document.getElementById('avgRequestsPerRequestGroup').textContent = avgRequestsPerRequestGroup;
  document.getElementById('maxRequestsPerRequestGroup').textContent = maxRequestsPerRequestGroup.toLocaleString();
  document.getElementById('totalRequestGroupRequests').textContent = allRequests.toLocaleString();
  document.getElementById('totalRequestGroupSuccess').textContent = totalSuccess.toLocaleString();
  document.getElementById('totalRequestGroupFail').textContent = totalFail.toLocaleString();
  document.getElementById('requestGroupSuccessRate').textContent = successRate + '%';
  document.getElementById('requestGroupFailRate').textContent = failRate + '%';
}

// 세션 ID를 짧은 형태로 변환하는 함수
function shortenSessionId(sessionId) {
  if (!sessionId) return 'unknown';

  // 세션 ID에서 마지막 부분 추출 (예: 1753762372.822885_7ddeda88_9355 -> session_9355)
  const parts = sessionId.split('_');
  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1];
    return `session_${lastPart}`;
  }

  // 다른 형태의 세션 ID 처리
  if (sessionId.includes('.')) {
    const parts = sessionId.split('.');
    if (parts.length >= 2) {
      const lastPart = parts[parts.length - 1];
      return `session_${lastPart.substring(0, 4)}`;
    }
  }

  // 기본 처리
  return `session_${sessionId.substring(sessionId.length - 4)}`;
}

// 컴퓨터 ID를 짧은 형태로 변환하는 함수
function shortenComputerId(computerId) {
  if (!computerId) return 'unknown';

  // 컴퓨터 ID에서 마지막 부분 추출 (예: COMP_6a0c002fee3d_1753762372.822906 -> computer_822906)
  if (computerId.startsWith('COMP_')) {
    const parts = computerId.split('_');
    if (parts.length >= 3) {
      const lastPart = parts[parts.length - 1];
      return `computer_${lastPart.split('.')[1] || lastPart.substring(0, 6)}`;
    }
  }

  // 다른 형태의 컴퓨터 ID 처리
  if (computerId.includes('.')) {
    const parts = computerId.split('.');
    if (parts.length >= 2) {
      const lastPart = parts[parts.length - 1];
      return `computer_${lastPart.substring(0, 6)}`;
    }
  }

  // 기본 처리
  return `computer_${computerId.substring(computerId.length - 6)}`;
}

// 요청 그룹 ID를 짧은 형태로 변환하는 함수
function shortenRequestGroupId(requestGroupId) {
  if (!requestGroupId) return 'unknown';

  // 요청 그룹 ID에서 마지막 부분 추출 (예: GROUP_220_118_0_154 -> group_154)
  if (requestGroupId.startsWith('GROUP_')) {
    const parts = requestGroupId.split('_');
    if (parts.length >= 2) {
      const lastPart = parts[parts.length - 1];
      return `group_${lastPart}`;
    }
  }

  // 다른 형태의 요청 그룹 ID 처리
  if (requestGroupId.includes('_')) {
    const parts = requestGroupId.split('_');
    if (parts.length >= 2) {
      const lastPart = parts[parts.length - 1];
      return `group_${lastPart.substring(0, 4)}`;
    }
  }

  // 기본 처리
  return `group_${requestGroupId.substring(requestGroupId.length - 4)}`;
} 