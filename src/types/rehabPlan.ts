export interface RehabPlanGoal {
    longTermGoal: string;
    shortTermGoal: string;
    servicePeriod: string;
    methodsAndStaff: string;
    achieved: boolean | null;
}

export interface RehabPlanFormData {
    approval: {
        teamLead: string;
        departmentHead: string;
        director: string;
    };
    client: {
        name: string;
        disabilityType: string;
        birthDate: string;
        address: string;
        phone: string;
    };
    background: {
        education: string;
        training: string;
        disabilityHistory: string;
        employmentHistory: string;
        importantWorkValue: string;
        employmentNeeds: string;
        familyEnvironment: string;
        otherInfo: string;
    };
    opinions: {
        clientAndGuardian: string;
    };
    caseMeeting: {
        dateTime: string;
        place: string;
        purpose: string;
        content: string;
        conclusion: string;
    };
    strengths: string;
    considerations: string;
    supportDirection: string;
    note: string;
    vocationalGoal: string;
    goals: RehabPlanGoal[];
    footer: {
        staff: string;
        writtenDate: string;
        participants: string;
        clientName: string;
    };
}
