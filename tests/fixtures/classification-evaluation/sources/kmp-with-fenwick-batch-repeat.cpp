#include <string>
#include <vector>
std::vector<int>prefix(const std::string&p){std::vector<int>pi(p.size());for(std::size_t i=1;i<p.size();++i){int j=pi[i-1];while(j&&p[i]!=p[j])j=pi[j-1];if(p[i]==p[j])++j;pi[i]=j;}return pi;}
struct FenwickCounter{std::vector<int>tree;explicit FenwickCounter(int n):tree(n+1){}void add(int index){for(++index;index<static_cast<int>(tree.size());index+=index&-index)++tree[index];}int prefix_count(int index)const{int answer=0;for(++index;index>0;index-=index&-index)answer+=tree[index];return answer;}};
int main(){std::string text="aaaa",pattern="aa";auto pi=prefix(pattern);FenwickCounter hits(text.size());int matched=0;for(int i=0;i<static_cast<int>(text.size());++i){while(matched&&text[i]!=pattern[matched])matched=pi[matched-1];if(text[i]==pattern[matched])++matched;if(matched==static_cast<int>(pattern.size())){hits.add(i-matched+1);matched=pi[matched-1];}}return hits.prefix_count(3)==3?0:1;}
