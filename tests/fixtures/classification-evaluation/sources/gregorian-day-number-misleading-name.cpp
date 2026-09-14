// The filename is an adversarial distractor.
bool leap_year(int year){return year%400==0||(year%4==0&&year%100!=0);}long long day_number(int year,int month,int day){static const int days_before_month[]={0,0,31,59,90,120,151,181,212,243,273,304,334};long long previous=year-1;long long result=previous*365+previous/4-previous/100+previous/400;result+=days_before_month[month]+day;if(month>2&&leap_year(year))++result;return result;}
int main(){return day_number(2024,3,1)-day_number(2024,2,28)==2?0:1;}
