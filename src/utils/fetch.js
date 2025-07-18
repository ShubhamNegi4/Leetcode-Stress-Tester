const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

async function fetchProblemByName(slug) {
    const body = {
        query: `
            query getProblem($titleSlug: String!) {
                question(titleSlug: $titleSlug) {
                    title
                    content
                    sampleTestCase
                    codeSnippets {
                        langSlug
                        code
                    }
                }
            }`,
        variables: { titleSlug: slug }
    };

    const res = await fetch('https://leetcode.com/graphql', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    
    if (!res.ok) throw new Error(`LeetCode API returned ${res.status}`);
    const json = await res.json();
    
    if (!json.data || !json.data.question) {
        throw new Error('Problem not found or API changed');
    }
    
    return json.data.question;
}

async function fetchProblemById(id) {
    const body = {
        operationName: "problemsetQuestionListV2",
        query: `
            query problemsetQuestionListV2(
                $limit: Int, 
                $searchKeyword: String,  
                $skip: Int, 
                $categorySlug: String
            ) {
                problemsetQuestionListV2(
                    limit: $limit
                    searchKeyword: $searchKeyword
                    skip: $skip
                    categorySlug: $categorySlug
                ) {
                    questions {
                        questionFrontendId
                        titleSlug
                    }
                }
            }`,
        variables: {
            skip: 0,
            limit: 10000,
            searchKeyword: id.toString(),
            categorySlug: "all-code-essentials"
        }
    };

    const res = await fetch('https://leetcode.com/graphql/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(`LeetCode API returned ${res.status}`);
    const json = await res.json();
    
    const questions = json.data?.problemsetQuestionListV2?.questions || [];
    for (const q of questions) {
        if (q.questionFrontendId === id.toString()) {
            return q.titleSlug;
        }
    }
    
    throw new Error(`Problem with ID ${id} not found`);
}

async function fetchOfficialSolutionPlayground(slug) {
    const body = {
        operationName: "ugcArticleOfficialSolutionArticle",
        query: `
            query ugcArticleOfficialSolutionArticle($questionSlug: String!) {
                ugcArticleOfficialSolutionArticle(questionSlug: $questionSlug) {
                    content
                }
            }`,
        variables: { questionSlug: slug }
    };

    const res = await fetch('https://leetcode.com/graphql/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(`LeetCode API returned ${res.status}`);
    const json = await res.json();
    
    const content = json?.data?.ugcArticleOfficialSolutionArticle?.content;
    if (!content) return null;
    
    const regex = /src="https:\/\/leetcode\.com\/playground\/([a-zA-Z0-9\-]{8,})\/shared"/;
    const match = content.match(regex);
    
    return match ? match[1] : null;
}

async function fetchOfficialSolution(slug, targetDir) {
    const playgroundUUID = await fetchOfficialSolutionPlayground(slug);
    if (!playgroundUUID) return false;

    const body = {
        query: `
            query fetchPlayground($uuid: String!) {
                allPlaygroundCodes(uuid: $uuid) {
                    code
                    langSlug
                }
            }`,
        variables: { uuid: playgroundUUID }
    };

    const res = await fetch('https://leetcode.com/graphql/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(`LeetCode API returned ${res.status}`);
    const json = await res.json();
    
    const cppSolution = json.data?.allPlaygroundCodes?.find(
        code => code.langSlug === 'cpp'
    )?.code;
    
    if (!cppSolution) return false;
    
    const filePath = path.join(targetDir, 'official.cpp');
    fs.writeFileSync(filePath, cppSolution);
    return true;
}

async function fetchGithubSolution(slug, targetDir) {
    const url = `https://raw.githubusercontent.com/kamyu104/LeetCode-Solutions/master/C++/${slug}.cpp`;
    const res = await fetch(url);
    
    if (!res.ok) return false;
    
    const codeCPP = await res.text();
    const filePath = path.join(targetDir, 'official.cpp');
    fs.writeFileSync(filePath, codeCPP);
    return true;
}

module.exports = { 
    fetchProblemByName, 
    fetchProblemById, 
    fetchOfficialSolution, 
    fetchGithubSolution 
};