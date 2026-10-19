export namespace config {
	
	export class CleanupPortRange {
	    start: number;
	    end: number;
	
	    static createFrom(source: any = {}) {
	        return new CleanupPortRange(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.start = source["start"];
	        this.end = source["end"];
	    }
	}
	export class CleanupRule {
	    id: string;
	    name: string;
	    enabled: boolean;
	    isBuiltin: boolean;
	    matchProcessNames: string[];
	    matchCommandKeywords: string[];
	    matchPorts: number[];
	    matchPortRanges: CleanupPortRange[];
	
	    static createFrom(source: any = {}) {
	        return new CleanupRule(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.enabled = source["enabled"];
	        this.isBuiltin = source["isBuiltin"];
	        this.matchProcessNames = source["matchProcessNames"];
	        this.matchCommandKeywords = source["matchCommandKeywords"];
	        this.matchPorts = source["matchPorts"];
	        this.matchPortRanges = this.convertValues(source["matchPortRanges"], CleanupPortRange);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CleanupRuleInput {
	    name: string;
	    enabled: boolean;
	    matchProcessNames: string[];
	    matchCommandKeywords: string[];
	    matchPorts: number[];
	    matchPortRanges: CleanupPortRange[];
	
	    static createFrom(source: any = {}) {
	        return new CleanupRuleInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.enabled = source["enabled"];
	        this.matchProcessNames = source["matchProcessNames"];
	        this.matchCommandKeywords = source["matchCommandKeywords"];
	        this.matchPorts = source["matchPorts"];
	        this.matchPortRanges = this.convertValues(source["matchPortRanges"], CleanupPortRange);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class OperationLog {
	    id: number;
	    action: string;
	    pid: number;
	    processName: string;
	    port: number;
	    result: string;
	    message: string;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new OperationLog(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.action = source["action"];
	        this.pid = source["pid"];
	        this.processName = source["processName"];
	        this.port = source["port"];
	        this.result = source["result"];
	        this.message = source["message"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class ProtectionSettings {
	    defaultProcessNames: string[];
	    customProcessNames: string[];
	
	    static createFrom(source: any = {}) {
	        return new ProtectionSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.defaultProcessNames = source["defaultProcessNames"];
	        this.customProcessNames = source["customProcessNames"];
	    }
	}

}

export namespace detail {
	
	export class ProcessPort {
	    port: number;
	    protocol: string;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new ProcessPort(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.port = source["port"];
	        this.protocol = source["protocol"];
	        this.status = source["status"];
	    }
	}
	export class ProcessDetail {
	    createdAt: number;
	    pid: number;
	    processName: string;
	    iconDataURL: string;
	    executablePath: string;
	    executablePathError: string;
	    commandLine: string;
	    commandLineError: string;
	    cpuPercent: number;
	    memoryBytes: number;
	    isProtected: boolean;
	    isDeveloperRelated: boolean;
	    ports: ProcessPort[];
	    portsError: string;
	    recentLogs: config.OperationLog[];
	    logsError: string;
	
	    static createFrom(source: any = {}) {
	        return new ProcessDetail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.createdAt = source["createdAt"];
	        this.pid = source["pid"];
	        this.processName = source["processName"];
	        this.iconDataURL = source["iconDataURL"];
	        this.executablePath = source["executablePath"];
	        this.executablePathError = source["executablePathError"];
	        this.commandLine = source["commandLine"];
	        this.commandLineError = source["commandLineError"];
	        this.cpuPercent = source["cpuPercent"];
	        this.memoryBytes = source["memoryBytes"];
	        this.isProtected = source["isProtected"];
	        this.isDeveloperRelated = source["isDeveloperRelated"];
	        this.ports = this.convertValues(source["ports"], ProcessPort);
	        this.portsError = source["portsError"];
	        this.recentLogs = this.convertValues(source["recentLogs"], config.OperationLog);
	        this.logsError = source["logsError"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace main {
	
	export class ResourceStatus {
	    state: string;
	    updatedAt: number;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new ResourceStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.state = source["state"];
	        this.updatedAt = source["updatedAt"];
	        this.error = source["error"];
	    }
	}
	export class SystemResourceInfo {
	    metrics: Record<string, ResourceStatus>;
	    cpuPercent: number;
	    cpuName: string;
	    cpuPhysicalCores: number;
	    cpuLogicalProcessors: number;
	    cpuMaxMHz: number;
	    totalMemoryBytes: number;
	    usedMemoryBytes: number;
	    freeMemoryBytes: number;
	    gpuPercent: number;
	    gpuNames: string[];
	    totalVRAMBytes: number;
	    usedVRAMBytes: number;
	    freeVRAMBytes: number;
	    processCount: number;
	    threadCount: number;
	    portCount: number;
	    uptimeSeconds: number;
	
	    static createFrom(source: any = {}) {
	        return new SystemResourceInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.metrics = this.convertValues(source["metrics"], ResourceStatus, true);
	        this.cpuPercent = source["cpuPercent"];
	        this.cpuName = source["cpuName"];
	        this.cpuPhysicalCores = source["cpuPhysicalCores"];
	        this.cpuLogicalProcessors = source["cpuLogicalProcessors"];
	        this.cpuMaxMHz = source["cpuMaxMHz"];
	        this.totalMemoryBytes = source["totalMemoryBytes"];
	        this.usedMemoryBytes = source["usedMemoryBytes"];
	        this.freeMemoryBytes = source["freeMemoryBytes"];
	        this.gpuPercent = source["gpuPercent"];
	        this.gpuNames = source["gpuNames"];
	        this.totalVRAMBytes = source["totalVRAMBytes"];
	        this.usedVRAMBytes = source["usedVRAMBytes"];
	        this.freeVRAMBytes = source["freeVRAMBytes"];
	        this.processCount = source["processCount"];
	        this.threadCount = source["threadCount"];
	        this.portCount = source["portCount"];
	        this.uptimeSeconds = source["uptimeSeconds"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class UpdateInfo {
	    currentVersion: string;
	    latestVersion: string;
	    available: boolean;
	    downloadURL: string;
	    releaseNotes: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.available = source["available"];
	        this.downloadURL = source["downloadURL"];
	        this.releaseNotes = source["releaseNotes"];
	    }
	}

}

export namespace port {
	
	export class Info {
	    createdAt: number;
	    port: number;
	    protocol: string;
	    status: string;
	    pid: number;
	    processName: string;
	    processPath: string;
	    isProtected: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Info(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.createdAt = source["createdAt"];
	        this.port = source["port"];
	        this.protocol = source["protocol"];
	        this.status = source["status"];
	        this.pid = source["pid"];
	        this.processName = source["processName"];
	        this.processPath = source["processPath"];
	        this.isProtected = source["isProtected"];
	    }
	}

}

export namespace process {
	
	export class Info {
	    parentPID: number;
	    workingDirectory: string;
	    workingDirectoryError: string;
	    projectPath: string;
	    projectName: string;
	    projectReason: string;
	    projectRuleSource: string;
	    applicationPath: string;
	    applicationName: string;
	    applicationReason: string;
	    createdAt: number;
	    pid: number;
	    name: string;
	    iconDataURL: string;
	    path: string;
	    commandLine: string;
	    user: string;
	    cpuPercent: number;
	    memoryBytes: number;
	    isProtected: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Info(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.parentPID = source["parentPID"];
	        this.workingDirectory = source["workingDirectory"];
	        this.workingDirectoryError = source["workingDirectoryError"];
	        this.projectPath = source["projectPath"];
	        this.projectName = source["projectName"];
	        this.projectReason = source["projectReason"];
	        this.projectRuleSource = source["projectRuleSource"];
	        this.applicationPath = source["applicationPath"];
	        this.applicationName = source["applicationName"];
	        this.applicationReason = source["applicationReason"];
	        this.createdAt = source["createdAt"];
	        this.pid = source["pid"];
	        this.name = source["name"];
	        this.iconDataURL = source["iconDataURL"];
	        this.path = source["path"];
	        this.commandLine = source["commandLine"];
	        this.user = source["user"];
	        this.cpuPercent = source["cpuPercent"];
	        this.memoryBytes = source["memoryBytes"];
	        this.isProtected = source["isProtected"];
	    }
	}
	export class OperationResult {
	    partial: boolean;
	    code: string;
	    success: boolean;
	    message: string;
	    pid: number;
	    processName: string;
	
	    static createFrom(source: any = {}) {
	        return new OperationResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.partial = source["partial"];
	        this.code = source["code"];
	        this.success = source["success"];
	        this.message = source["message"];
	        this.pid = source["pid"];
	        this.processName = source["processName"];
	    }
	}

}

